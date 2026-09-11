// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

// Everything is real. The detail page's whole contract is that it RENDERS ANSWERS the server
// already resolved (`planJobJump`, `planJobPhoto`, formatted numbers) and re-derives nothing —
// so the tests hand it decided facts and pin what it does with each one. The pure formatters are
// imported to compute expected strings, never retyped.
import { NinaJobDetail } from './NinaJobDetail'
import { NINA_JOB_JUMP_NOTE, formatJobLatency, formatJobSeconds, formatMicroUsd, jobElapsedSeconds } from '@/lib/nina/jobview'
import { MISSING } from '@/lib/format'

const CREATED_AT_MS = 1_790_000_000_000
const NOW_MS = CREATED_AT_MS + 30_000

type Props = Parameters<typeof NinaJobDetail>[0]

function props(overrides?: Partial<Props>): Props {
  return {
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
  it('an open job ticks and says since when; a closed one shows its latency and its opening time', () => {
    const { unmount } = render(<NinaJobDetail {...props({ stage: 'running' })} />)
    expect(screen.getByText(formatJobSeconds(jobElapsedSeconds(CREATED_AT_MS, NOW_MS)))).toBeInTheDocument()
    expect(screen.getByText('Jalan sejak 20 Aug, 17:02')).toBeInTheDocument()
    unmount()

    render(<NinaJobDetail {...props()} />)
    expect(screen.getByText(formatJobLatency(74_000))).toBeInTheDocument()
    expect(screen.getByText('Dibuka 20 Aug, 17:02')).toBeInTheDocument()
  })

  it('a failure is red, and its words are the server’s errorLabel and nothing else', () => {
    render(
      <NinaJobDetail
        {...props({ stage: 'failed', stageLabel: 'Gagal', errorLabel: 'The model was overloaded.' })}
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
      screen.getByText('Job ini nggak nyimpen catatan fotonya — barisnya dibuat sebelum catatan itu ada.'),
    ).toBeInTheDocument()
  })
})
