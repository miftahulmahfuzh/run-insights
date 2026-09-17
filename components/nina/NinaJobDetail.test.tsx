// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { redoNinaImageJob, updateNinaImageJobPrompt } = vi.hoisted(() => ({
  redoNinaImageJob: vi.fn(),
  updateNinaImageJobPrompt: vi.fn(),
}))
vi.mock('@/lib/nina/jobActions', () => ({ redoNinaImageJob, updateNinaImageJobPrompt }))

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }))

// Everything is real. The detail page's whole contract is that it RENDERS ANSWERS the server
// already resolved (`planJobJump`, `planJobPhoto`, formatted numbers) and re-derives nothing —
// so the tests hand it decided facts and pin what it does with each one. The pure formatters are
// imported to compute expected strings, never retyped.
import { NinaJobDetail } from './NinaJobDetail'
import {
  NINA_JOB_JUMP_NOTE,
  formatJobLatency,
  formatJobSeconds,
  formatMicroUsd,
  jobElapsedSeconds,
} from '@/lib/nina/jobview'
import { MISSING } from '@/lib/format'

const CREATED_AT_MS = 1_790_000_000_000
const NOW_MS = CREATED_AT_MS + 30_000

type Props = Parameters<typeof NinaJobDetail>[0]

function props(overrides?: Partial<Props>): Props {
  return {
    jobId: 'job-1',
    stage: 'done',
    stageLabel: 'Selesai',
    errorLabel: null,
    purpose: 'selfie',
    mood: 'golden hour',
    prompt: 'sebuah foto selfie di pantai',
    sidecar: 'model: glm-4.6v\n--- prompt as sent ---\nsebuah foto selfie di pantai',
    seed: 42,
    model: 'glm-4.6v',
    attempts: 2,
    costMicroUsd: 80_000,
    costSource: 'openrouter',
    latencyMs: 74_000,
    createdAtMs: CREATED_AT_MS,
    createdAtLabel: '20 Aug, 17:02',
    nowMs: NOW_MS,
    jump: { kind: 'ready', href: '/nina?s=sess-1&at=msg000000001' },
    photo: { kind: 'ready', href: '/nina?photo=job-1' },
    ...overrides,
  }
}

describe('NinaJobDetail', () => {
  beforeEach(() => {
    redoNinaImageJob.mockReset().mockResolvedValue({ ok: true, reason: null, jobId: 'job-2' })
    updateNinaImageJobPrompt.mockReset().mockResolvedValue({ ok: true, reason: null })
    routerPush.mockReset()
  })

  it('an open job ticks and says since when; a closed one shows its latency and its opening time', () => {
    const { unmount } = render(<NinaJobDetail {...props({ stage: 'running' })} />)
    expect(
      screen.getByText(formatJobSeconds(jobElapsedSeconds(CREATED_AT_MS, NOW_MS))),
    ).toBeInTheDocument()
    expect(screen.getByText('Jalan sejak 20 Aug, 17:02')).toBeInTheDocument()
    unmount()

    render(<NinaJobDetail {...props()} />)
    expect(screen.getByText(formatJobLatency(74_000))).toBeInTheDocument()
    expect(screen.getByText('Dibuka 20 Aug, 17:02')).toBeInTheDocument()
  })

  it('a failure is red, and its words are the server’s errorLabel and nothing else', () => {
    render(
      <NinaJobDetail
        {...props({
          stage: 'failed',
          stageLabel: 'Gagal',
          errorLabel: 'The model was overloaded.',
        })}
      />,
    )
    const heading = screen.getByText('Gagal')
    expect(heading.className).toContain('text-red')
    expect(screen.getByText('The model was overloaded.')).toBeInTheDocument()
  })

  it('a non-failure renders no error block', () => {
    render(<NinaJobDetail {...props()} />)
    expect(screen.queryByText(/overloaded/)).not.toBeInTheDocument()
  })

  it('a ready jump is the conversation control, named for VoiceOver, pointed at the bubble', () => {
    render(<NinaJobDetail {...props()} />)
    const link = screen.getByRole('link', { name: 'Buka chat-nya' })
    expect(link.getAttribute('href')).toBe('/nina?s=sess-1&at=msg000000001')
  })

  it.each(['avatar', 'no-photo'] as const)(
    'an %s jump degrades to a sentence, and no control navigates nowhere',
    (kind) => {
      render(<NinaJobDetail {...props({ jump: { kind } })} />)
      expect(screen.queryByRole('link', { name: 'Buka chat-nya' })).not.toBeInTheDocument()
      expect(screen.getByText(NINA_JOB_JUMP_NOTE[kind])).toBeInTheDocument()
    },
  )

  it('a proved photograph is a real link; an absent one is stated by the icon’s absence', () => {
    const { unmount } = render(<NinaJobDetail {...props()} />)
    expect(screen.getByRole('link', { name: 'Lihat foto ukuran penuh' })).toHaveAttribute(
      'href',
      '/nina?photo=job-1',
    )
    unmount()

    render(<NinaJobDetail {...props({ photo: { kind: 'none' } })} />)
    expect(screen.queryByRole('link', { name: /foto/ })).not.toBeInTheDocument()
  })

  it('the degraded jump and a proved photograph render TOGETHER — sentence beside the control', () => {
    render(<NinaJobDetail {...props({ jump: { kind: 'no-photo' } })} />)
    expect(screen.getByText(NINA_JOB_JUMP_NOTE['no-photo'])).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Lihat foto ukuran penuh' })).toBeInTheDocument()
  })

  it('the stats card answers Jenis, Percobaan, Biaya total, Seed, Model and Suasana', () => {
    render(<NinaJobDetail {...props()} />)
    expect(screen.getByText('Selfie')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    // A per-JOB cumulative total beside the attempt count — the label says "total" on purpose.
    expect(screen.getByText(formatMicroUsd(80_000))).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('glm-4.6v')).toBeInTheDocument()
    expect(screen.getByText('golden hour')).toBeInTheDocument()
  })

  it('absent numbers and mood degrade to the app’s one missing mark, never to empty', () => {
    render(<NinaJobDetail {...props({ costMicroUsd: null, seed: null, mood: null })} />)
    const dashes = screen.getAllByText(MISSING)
    expect(dashes.length).toBe(3)
  })

  it('an avatar job says Foto profil in Jenis', () => {
    render(<NinaJobDetail {...props({ purpose: 'avatar' })} />)
    expect(screen.getByText('Foto profil')).toBeInTheDocument()
  })

  it('the notes card shows the sidecar — the metadata block and the prompt as one record', () => {
    render(<NinaJobDetail {...props()} />)
    expect(screen.getByText(/--- prompt as sent ---/)).toBeInTheDocument()
    expect(screen.getByText('Catatan foto')).toBeInTheDocument()
  })

  it('a row with only the bare prompt still shows that', () => {
    render(<NinaJobDetail {...props({ sidecar: null })} />)
    expect(screen.getByText('sebuah foto selfie di pantai')).toBeInTheDocument()
  })

  it('a row with neither says so instead of rendering an empty card', () => {
    render(<NinaJobDetail {...props({ sidecar: null, prompt: null })} />)
    expect(
      screen.getByText(
        'Job ini nggak nyimpen catatan fotonya — barisnya dibuat sebelum catatan itu ada.',
      ),
    ).toBeInTheDocument()
  })

  const REAL_SHAPE_SIDECAR = [
    'provider:   openrouter',
    'model:      glm-4.6v',
    'purpose:    selfie',
    'resolution: 1024x1536 2:3',
    'seed:       42',
    'reference:  none (RU-18)',
    '',
    '--- prompt as sent ---',
    'sebuah foto selfie di pantai',
  ].join('\n')

  it('the job id renders above "provider:" (2026-09-17)', () => {
    render(<NinaJobDetail {...props({ jobId: 'HIiyRr5_zemf', sidecar: REAL_SHAPE_SIDECAR })} />)
    expect(screen.getByText(/job:\s+HIiyRr5_zemf/)).toBeInTheDocument()
  })

  it('cost source lands right after resolution — openrouter', () => {
    render(<NinaJobDetail {...props({ sidecar: REAL_SHAPE_SIDECAR, costSource: 'openrouter' })} />)
    expect(screen.getByText(/cost source: openrouter api response/)).toBeInTheDocument()
  })

  it('cost source lands right after resolution — fallback', () => {
    render(<NinaJobDetail {...props({ sidecar: REAL_SHAPE_SIDECAR, costSource: 'fallback' })} />)
    expect(screen.getByText(/cost source: fallback constant/)).toBeInTheDocument()
  })

  it('no cost source yet renders no line at all — not a blank one', () => {
    render(<NinaJobDetail {...props({ sidecar: REAL_SHAPE_SIDECAR, costSource: null })} />)
    expect(screen.queryByText(/cost source/)).not.toBeInTheDocument()
  })

  it('an old sidecar shape (no "provider:" line) is left exactly as it was', () => {
    render(
      <NinaJobDetail
        {...props({
          sidecar: 'model: glm-4.6v\n--- prompt as sent ---\nsebuah foto selfie di pantai',
          costSource: 'openrouter',
        })}
      />,
    )
    expect(screen.queryByText(/cost source/)).not.toBeInTheDocument()
  })

  it('a bare prompt (no sidecar at all) never grows a cost source line', () => {
    render(<NinaJobDetail {...props({ sidecar: null, costSource: 'openrouter' })} />)
    expect(screen.queryByText(/cost source/)).not.toBeInTheDocument()
  })

  it('a failed job and a done job both draw a retry control; a still-running one does not', () => {
    const { unmount } = render(
      <NinaJobDetail {...props({ stage: 'failed', stageLabel: 'Gagal' })} />,
    )
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument()
    unmount()

    const { unmount: unmountDone } = render(<NinaJobDetail {...props({ stage: 'done' })} />)
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument()
    unmountDone()

    render(<NinaJobDetail {...props({ stage: 'running' })} />)
    expect(screen.queryByRole('button', { name: 'Coba lagi' })).not.toBeInTheDocument()
  })

  it('a tap retries this job and lands on the new job’s own detail page', async () => {
    const user = userEvent.setup()
    render(<NinaJobDetail {...props({ stage: 'failed', stageLabel: 'Gagal' })} />)

    await user.click(screen.getByRole('button', { name: 'Coba lagi' }))

    await waitFor(() => expect(redoNinaImageJob).toHaveBeenCalledWith({ jobId: 'job-1' }))
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/nina/jobs/job-2'))
  })

  it('a refusal renders its sentence and never navigates', async () => {
    redoNinaImageJob.mockResolvedValue({ ok: false, reason: 'capped', jobId: null })
    const user = userEvent.setup()
    render(<NinaJobDetail {...props({ stage: 'failed', stageLabel: 'Gagal' })} />)

    await user.click(screen.getByRole('button', { name: 'Coba lagi' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Jatah foto hari ini sudah habis. Coba lagi besok ya.',
    )
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('the pencil opens an editable textarea prefilled with the bare prompt, never the sidecar', async () => {
    const user = userEvent.setup()
    render(<NinaJobDetail {...props()} />)

    await user.click(screen.getByRole('button', { name: 'Ubah prompt' }))

    expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveValue(
      'sebuah foto selfie di pantai',
    )
  })

  it('Batal discards the draft and returns to the read-only view untouched', async () => {
    const user = userEvent.setup()
    render(<NinaJobDetail {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Ubah prompt' }))
    await user.clear(screen.getByRole('textbox', { name: 'Prompt' }))
    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), 'a different draft')

    await user.click(screen.getByRole('button', { name: 'Batal' }))

    expect(screen.queryByRole('textbox', { name: 'Prompt' })).not.toBeInTheDocument()
    expect(updateNinaImageJobPrompt).not.toHaveBeenCalled()
    expect(screen.getByText(/--- prompt as sent ---/)).toBeInTheDocument()
  })

  it('Simpan saves the exact draft text for THIS job and returns to the read-only view', async () => {
    const user = userEvent.setup()
    render(<NinaJobDetail {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Ubah prompt' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Prompt' }), {
      target: { value: '  no nsfw words here  ' },
    })

    await user.click(screen.getByRole('button', { name: 'Simpan' }))

    await waitFor(() =>
      expect(updateNinaImageJobPrompt).toHaveBeenCalledWith({
        jobId: 'job-1',
        prompt: '  no nsfw words here  ',
      }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Prompt' })).not.toBeInTheDocument(),
    )
  })

  it('a save refusal keeps the textarea open and shows the sentence', async () => {
    updateNinaImageJobPrompt.mockResolvedValue({ ok: false, reason: 'empty-prompt' })
    const user = userEvent.setup()
    render(<NinaJobDetail {...props()} />)
    await user.click(screen.getByRole('button', { name: 'Ubah prompt' }))

    await user.click(screen.getByRole('button', { name: 'Simpan' }))

    expect(await screen.findByRole('status')).toHaveTextContent(/kosong/i)
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toBeInTheDocument()
  })

  it('while editing, the retry control is hidden', async () => {
    const user = userEvent.setup()
    render(<NinaJobDetail {...props({ stage: 'failed', stageLabel: 'Gagal' })} />)
    expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ubah prompt' }))

    expect(screen.queryByRole('button', { name: 'Coba lagi' })).not.toBeInTheDocument()
  })
})
