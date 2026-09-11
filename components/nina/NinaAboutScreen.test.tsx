// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { routerPush, routerRefresh } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
}))
// `useSearchParams` reads the LIVE location each render, which is exactly the integration the
// screen depends on: the open photo is DERIVED from the URL, never mirrored into state, so a
// test re-renders after a history write the way Next's patched history re-renders for real.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

const { attachNinaPhotoToChat, deleteNinaChatPhoto } = vi.hoisted(() => ({
  attachNinaPhotoToChat: vi.fn(),
  deleteNinaChatPhoto: vi.fn(),
}))
vi.mock('@/lib/nina/albumActions', () => ({ attachNinaPhotoToChat, deleteNinaChatPhoto }))

// The job list's mutations are transitive imports of ./NinaJobList (through ./NinaJobActions) and
// pull the auth boundary (next-auth → next/server); this screen renders the list read-only.
vi.mock('@/lib/nina/jobActions', () => ({ redoNinaImageJob: vi.fn(), deleteNinaImageJob: vi.fn() }))

const { useSavePhoto } = vi.hoisted(() => ({ useSavePhoto: vi.fn() }))
// The save ladder is useSavePhoto's, covered by the ChatPhotoActions file from its own seam. Only
// the hook is stubbed; the shared notice wording stays real.
vi.mock('@/components/ui/useSavePhoto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/useSavePhoto')>()),
  useSavePhoto,
}))

// PhotoViewer is its own covered surface (swipe rules, wrap, keys). Here it is a probe: what this
// screen owes it is the right LIST per section, the right index, and a close that lands.
vi.mock('@/components/ui/PhotoViewer', () => ({
  PhotoViewer: (props: { photos: unknown[]; index: number; onClose: () => void }) => (
    <div data-testid="viewer" data-count={props.photos.length} data-index={props.index}>
      <button type="button" data-testid="viewer-close" onClick={props.onClose}>
        close
      </button>
    </div>
  ),
}))

// Real everything else: the codec, `aboutViewerLists`, the grids, the job list, the avatar.
import { NinaAboutScreen } from './NinaAboutScreen'
import { NINA_JOBS_HREF, type NinaJobListItem } from '@/lib/nina/jobview'
import {
  NINA_ABOUT_PHOTO_PARAM,
  NINA_ATTACH_MAX_CHARS,
  type NinaAlbumPhoto,
  type NinaAvatarView,
  type NinaGalleryPhoto,
} from '@/lib/nina/album'
import { attachStripPadBottomCss, NINA_KEYBOARD_OVERLAP_VAR } from '@/lib/nina/chatview'

const AVATAR: NinaAvatarView = {
  src: 'https://blob.example/avatar.jpg',
  natural: { width: 1200, height: 900 },
  crop: null,
  description: null,
  isFallback: false,
}

function albumPhoto(id: string, isCurrent = false): NinaAlbumPhoto {
  return {
    id,
    url: `https://blob.example/album-${id}.jpg`,
    kind: 'avatar',
    label: 'Foto profil Nina',
    isCurrent,
    description: null,
  }
}

function galleryPhoto(id: string, side: 'his' | 'hers' = 'his'): NinaGalleryPhoto {
  return {
    id,
    messageId: `msg-${id}`,
    url: `https://blob.example/chat-${id}.jpg`,
    kind: side === 'his' ? 'upload' : 'generated',
    side,
    label: side === 'his' ? 'Foto kamu' : 'Foto Nina',
  }
}

function job(overrides?: Partial<NinaJobListItem>): NinaJobListItem {
  return {
    id: 'job-1',
    href: '/nina/jobs?jump=job-1',
    stage: 'done',
    stageLabel: 'Selesai',
    purpose: 'selfie',
    scene: 'sore di kos',
    attempts: 1,
    createdAtMs: 1_790_000_000_000,
    errorLabel: null,
    latencyMs: 74_000,
    open: false,
    canRedo: false,
    ...overrides,
  }
}

type Props = Parameters<typeof NinaAboutScreen>[0]

function props(overrides?: Partial<Props>): Props {
  return {
    avatar: AVATAR,
    album: [albumPhoto('a1'), albumPhoto('a2', true)],
    gallery: [galleryPhoto('c1', 'his'), galleryPhoto('c2', 'hers')],
    jobs: [],
    jobsNowMs: 1_790_000_000_000,
    resolvedPhoto: null,
    returnTo: null,
    ...overrides,
  }
}

function viewer() {
  return document.querySelector('[data-testid="viewer"]') as HTMLElement | null
}

function renderScreen(overrides?: Partial<Props>) {
  return render(<NinaAboutScreen {...props(overrides)} />)
}

function at(section: 'album' | 'chat', id: string) {
  window.history.replaceState(null, '', `/nina/about?${NINA_ABOUT_PHOTO_PARAM}=${section}.${id}`)
}

beforeEach(() => {
  attachNinaPhotoToChat.mockReset().mockResolvedValue({ ok: true, next: '/nina?s=sess-9' })
  deleteNinaChatPhoto.mockReset().mockResolvedValue({ ok: true })
  useSavePhoto.mockReset().mockReturnValue({
    busy: false,
    notice: null,
    warm: vi.fn(),
    save: vi.fn(),
  })
  routerPush.mockReset()
  routerRefresh.mockReset()
  window.history.replaceState(null, '', '/nina/about')
})

describe('NinaAboutScreen — the page', () => {
  it('the hero names her, and the album face renders the view the server threaded down', () => {
    renderScreen()
    expect(screen.getByText('Nina')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Lihat foto profil Nina ukuran penuh' }),
    ).toBeInTheDocument()
    const img = document.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe(AVATAR.src)
  })

  it('both grids render: the album rings its current face, Media labels both sides', () => {
    renderScreen()
    // Media, not absence: the gallery has rows, so the grid is there with honest labels.
    expect(screen.getByRole('button', { name: 'Foto kamu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Foto Nina' })).toBeInTheDocument()
  })

  it('an empty Media section says so in its own sentence', () => {
    renderScreen({ gallery: [] })
    expect(
      screen.getByText('Belum ada foto di chat. Kirim satu ke Nina, atau minta dia kirim.'),
    ).toBeInTheDocument()
  })

  it('the job section is the /nina/jobs list with this surface’s own empty words', () => {
    renderScreen({ jobs: [] })
    expect(
      screen.getByText('Belum ada foto yang dibuat. Minta Nina kirim foto lewat chat.'),
    ).toBeInTheDocument()
    // "Semua" goes to the full list only when there is something to summarise — no count claims.
    expect(screen.queryByRole('link', { name: 'Semua' })).not.toBeInTheDocument()
  })

  it('with jobs, the Semua link and the rows are the console’s own components', () => {
    renderScreen({ jobs: [job()] })
    expect(screen.getByRole('link', { name: 'Semua' }).getAttribute('href')).toBe(NINA_JOBS_HREF)
    expect(screen.getByRole('link', { name: /sore di kos/ })).toBeInTheDocument()
  })
})

describe('NinaAboutScreen — the viewer', () => {
  it('a grid tap pushes a history entry and the viewer opens on the album arm', () => {
    const utils = renderScreen()
    const current = screen.getAllByRole('button', { name: 'Foto profil Nina' })[1] as HTMLElement
    fireEvent.click(current)

    expect(window.location.search).toBe(`?${NINA_ABOUT_PHOTO_PARAM}=album.a2`)
    utils.rerender(<NinaAboutScreen {...props()} />)
    // The album arm only: two faces, opened on the CURRENT one.
    expect(viewer()?.getAttribute('data-count')).toBe('2')
    expect(viewer()?.getAttribute('data-index')).toBe('1')
  })

  it('a deep link to a chat photograph in the window opens the chat arm', () => {
    at('chat', 'c2')
    const utils = renderScreen()
    expect(viewer()?.getAttribute('data-count')).toBe('2')
    expect(viewer()?.getAttribute('data-index')).toBe('1')
    utils.unmount()
  })

  it('an out-of-window deep link opens on the server-resolved photograph, appended to the chat arm', () => {
    at('chat', 'c-old')
    const resolved = galleryPhoto('c-old')
    renderScreen({ resolvedPhoto: resolved })
    // The grid keeps mapping the gallery prop; the VIEWER carries the appended row.
    expect(screen.getAllByRole('button', { name: 'Foto kamu' }).length).toBe(1)
    expect(viewer()?.getAttribute('data-count')).toBe('3')
    expect(viewer()?.getAttribute('data-index')).toBe('2')
  })

  it('an id nobody can resolve is a closed viewer, never an error', () => {
    at('chat', 'deleted-forever')
    renderScreen()
    expect(viewer()).toBeNull()
  })

  it('a hand-typed album id that is not hers is also just closed', () => {
    at('album', 'not-in-album')
    renderScreen()
    expect(viewer()).toBeNull()
  })

  it('closing what THIS screen pushed goes back — the pushed entry is undone, not replaced', () => {
    at('chat', 'c1')
    const utils = renderScreen()
    expect(viewer()).not.toBeNull()

    fireEvent.click(screen.getByTestId('viewer-close'))
    // `history.back()` popped the parameter — rerender is what Next's patched history would do.
    utils.rerender(<NinaAboutScreen {...props()} />)
    expect(viewer()).toBeNull()
  })

  it('closing a deep link with a return leg pushes the origin — the runner lands on Detail foto', () => {
    at('chat', 'c1')
    renderScreen({ returnTo: '/nina/jobs/job-1' })
    fireEvent.click(screen.getByTestId('viewer-close'))

    expect(routerPush).toHaveBeenCalledWith('/nina/jobs/job-1')
  })

  it('closing a deep link with no origin strips the parameter in place', () => {
    at('chat', 'c1')
    const utils = renderScreen()
    fireEvent.click(screen.getByTestId('viewer-close'))

    expect(routerPush).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
    utils.rerender(<NinaAboutScreen {...props()} />)
    expect(viewer()).toBeNull()
  })
})

describe('NinaAboutScreen — the attach strip', () => {
  function openStrip(overrides?: Partial<Props>) {
    at('chat', 'c1')
    return renderScreen(overrides)
  }

  it('the strip rides the open viewer only, ending at the keyboard var with the gated floor', () => {
    renderScreen()
    expect(screen.queryByLabelText('Pertanyaan tentang foto ini')).not.toBeInTheDocument()

    const utils = openStrip()
    const input = screen.getByLabelText('Pertanyaan tentang foto ini') as HTMLInputElement
    expect(input.getAttribute('maxlength')).toBe(String(NINA_ATTACH_MAX_CHARS))
    const strip = input.parentElement as HTMLElement
    expect(strip.style.bottom).toBe(`var(${NINA_KEYBOARD_OVERLAP_VAR}, 0px)`)
    expect(strip.style.paddingBottom).toBe(attachStripPadBottomCss(0))
    utils.unmount()
  })

  it('the two sends wear glyphs; the words they replaced are the accessible names', () => {
    openStrip()
    expect(screen.getByRole('button', { name: 'Kirim ke chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kirim ke chat baru' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unduh foto' })).toBeInTheDocument()
  })

  it('sending to the recent chat passes the question, the photo, and the target — then refreshes BEFORE pushing', async () => {
    const user = userEvent.setup()
    openStrip()
    await user.type(screen.getByLabelText('Pertanyaan tentang foto ini'), 'ini di mana?')
    await user.click(screen.getByRole('button', { name: 'Kirim ke chat' }))

    await waitFor(() =>
      expect(attachNinaPhotoToChat).toHaveBeenCalledWith({
        kind: 'image',
        id: 'c1',
        body: 'ini di mana?',
        target: 'recent',
      }),
    )
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/nina?s=sess-9'))
    expect(routerRefresh).toHaveBeenCalled()
    expect(routerRefresh.mock.invocationCallOrder[0]).toBeLessThan(
      routerPush.mock.invocationCallOrder[0]!,
    )
  })

  it('an album face attaches as the avatar kind', async () => {
    const user = userEvent.setup()
    at('album', 'a1')
    renderScreen()
    await user.click(screen.getByRole('button', { name: 'Kirim ke chat' }))

    await waitFor(() =>
      expect(attachNinaPhotoToChat).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'avatar', id: 'a1' }),
      ),
    )
  })

  it('a refused send says so on the strip the runner is standing on', async () => {
    const user = userEvent.setup()
    attachNinaPhotoToChat.mockResolvedValue({ ok: false, next: null })
    openStrip()
    await user.click(screen.getByRole('button', { name: 'Kirim ke chat' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Gagal kirim fotonya. Coba lagi.')
  })

  it('one flight for two sends: the other control is unreachable mid-send', async () => {
    const user = userEvent.setup()
    let release!: (value: { ok: boolean; next: string | null }) => void
    attachNinaPhotoToChat.mockReturnValue(
      new Promise(
        (res) => (release = res as (value: { ok: boolean; next: string | null }) => void),
      ),
    )
    openStrip()
    await user.click(screen.getByRole('button', { name: 'Kirim ke chat' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Kirim ke chat baru' })).toBeDisabled(),
    )
    expect(screen.getByRole('button', { name: 'Kirim ke chat' })).toBeDisabled()
    // The whole strip shares the flight: nothing on it is reachable mid-send. Only the LOADING
    // dots are per-control — the download's `busy` is useSavePhoto's, not this row's.
    expect(screen.getByRole('button', { name: 'Unduh foto' })).toBeDisabled()

    release({ ok: true, next: '/nina?s=sess-9' })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Kirim ke chat baru' })).toBeEnabled(),
    )
    expect(screen.getByRole('button', { name: 'Unduh foto' })).toBeEnabled()
  })

  it('the delete exists for HIS chat photographs only — one tap, no confirmation', async () => {
    const user = userEvent.setup()
    const utils = openStrip()
    expect(screen.getByRole('button', { name: 'Hapus foto' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Hapus foto' }))
    await waitFor(() => expect(deleteNinaChatPhoto).toHaveBeenCalledWith({ id: 'c1' }))
    await waitFor(() => expect(routerRefresh).toHaveBeenCalledTimes(1))
    utils.unmount()
  })

  it('hers are the operator’s collection: the runner is never shown a button the server would refuse', () => {
    at('chat', 'c2')
    renderScreen()
    expect(screen.queryByRole('button', { name: 'Hapus foto' })).not.toBeInTheDocument()
  })

  it('an album cell is an avatar — there is no delete there and never has been', () => {
    at('album', 'a1')
    renderScreen()
    expect(screen.queryByRole('button', { name: 'Hapus foto' })).not.toBeInTheDocument()
  })

  it('a refused delete wears the strip’s shared failure sentence', async () => {
    const user = userEvent.setup()
    deleteNinaChatPhoto.mockResolvedValue({ ok: false })
    openStrip()
    await user.click(screen.getByRole('button', { name: 'Hapus foto' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Gagal menghapus foto. Coba lagi.')
  })
})
