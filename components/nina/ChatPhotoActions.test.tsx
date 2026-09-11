// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { useSavePhoto } = vi.hoisted(() => ({ useSavePhoto: vi.fn() }))
// The download machinery (share/download/open ladder, the Safari warm, the AbortError silence)
// moved to components/ui/useSavePhoto.ts on purpose — this component's job is the two discs, their
// names and their states. Only the hook is stubbed; SAVE_NOTICE_TEXT stays real, so the wording
// these tests assert is the wording the runner reads.
vi.mock('@/components/ui/useSavePhoto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/useSavePhoto')>()),
  useSavePhoto,
}))

// Real notice table: what the runner actually reads must be the shipped Indonesian strings.
import { ChatPhotoActions } from './ChatPhotoActions'
import { SAVE_NOTICE_TEXT } from '@/components/ui/useSavePhoto'

function renderActions(overrides?: {
  url?: string
  label?: string
  onAttach?: (() => void) | null
  hook?: Partial<{
    busy: boolean
    notice: 'opened' | 'unavailable' | null
    warm: () => void
    save: () => void
  }>
}) {
  const {
    url = 'https://blob.example/photo.jpg',
    label = 'Foto kamu',
    onAttach = vi.fn(),
  } = overrides ?? {}
  const warm = vi.fn()
  const save = vi.fn()
  const hook = { busy: false, notice: null, warm, save, ...overrides?.hook }
  useSavePhoto.mockReturnValue(hook)
  const utils = render(<ChatPhotoActions url={url} label={label} onAttach={onAttach} />)
  return { ...utils, onAttach: onAttach as () => void, warm, save, hook }
}

describe('ChatPhotoActions', () => {
  beforeEach(() => {
    useSavePhoto.mockReset()
  })

  it('the hook is asked about the photo on screen, in the nina scope', () => {
    renderActions({ url: 'https://blob.example/photo.jpg' })
    expect(useSavePhoto).toHaveBeenCalledWith('https://blob.example/photo.jpg', 'nina')
  })

  it('both names are built off the side label, saying nothing about what is in the photo', () => {
    renderActions({ label: 'Foto Nina' })
    expect(screen.getByRole('button', { name: 'Unduh foto nina' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lampirkan foto nina ke chat' })).toBeInTheDocument()
  })

  it('the attach control does not render while the photo’s row id has not reached the client', () => {
    renderActions({ onAttach: null })
    // A real state, not a bug: an optimistic row has no imageIds yet. Viewing and downloading
    // still work on it.
    expect(screen.queryByRole('button', { name: /Lampirkan/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unduh foto kamu' })).toBeInTheDocument()
  })

  it('the paperclip pins the photo on screen to the next message', async () => {
    const user = userEvent.setup()
    const { onAttach } = renderActions({})
    await user.click(screen.getByRole('button', { name: /Lampirkan/ }))
    expect(onAttach).toHaveBeenCalledTimes(1)
  })

  it('pointerdown and focus warm the save; the click itself saves', async () => {
    const user = userEvent.setup()
    const { warm, save } = renderActions({})
    const download = screen.getByRole('button', { name: 'Unduh foto kamu' })

    download.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(warm).toHaveBeenCalledTimes(1)

    await user.click(download)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('a save in flight disables and announces busy on the download disc', () => {
    renderActions({ hook: { busy: true } })
    const download = screen.getByRole('button', { name: 'Unduh foto kamu' })
    expect(download).toBeDisabled()
    expect(download).toHaveAttribute('aria-busy', 'true')
  })

  it.each([
    ['opened', SAVE_NOTICE_TEXT.opened],
    ['unavailable', SAVE_NOTICE_TEXT.unavailable],
  ] as const)('the %s notice is a status region carrying the shared wording', (notice, text) => {
    renderActions({ hook: { notice } })
    expect(screen.getByRole('status').textContent).toBe(text)
  })

  it('no notice, no status region', () => {
    renderActions({})
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
