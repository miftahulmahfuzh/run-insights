// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { routerPush, routerRefresh, routerReplace } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
  routerReplace: vi.fn(),
}))
// `useSearchParams` reads the LIVE location each render, which is exactly the integration the
// screen depends on: the open photo is DERIVED from the URL, never mirrored into state, so a
// test re-renders after a history write the way Next's patched history re-renders for real.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPush,
    refresh: routerRefresh,
    replace: routerReplace,
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

const { attachNinaPhotoToChat, deleteNinaChatPhoto } = vi.hoisted(() => ({
  attachNinaPhotoToChat: vi.fn(),
  deleteNinaChatPhoto: vi.fn(),
}))
vi.mock('@/lib/nina/albumActions', () => ({ attachNinaPhotoToChat, deleteNinaChatPhoto }))

// The viewer header's job-detail control pre-flights the job id through this action before it
// navigates (`NinaJobDetailLink`). The real module is `'use server'` over the db layer; the rule
// it enforces is that component's own and is tested there — here it is a seam.
const { ninaImageJobExists } = vi.hoisted(() => ({ ninaImageJobExists: vi.fn() }))
vi.mock('@/lib/nina/jobActions', () => ({ ninaImageJobExists }))

const { fetchNinaAlbumPage, fetchNinaMediaPage } = vi.hoisted(() => ({
  fetchNinaAlbumPage: vi.fn(),
  fetchNinaMediaPage: vi.fn(),
}))
// The real module pulls in `next/headers` and the db layer — real server-only weight this
// happy-dom test must never load. The pager tests below stub these directly.
vi.mock('@/lib/nina/aboutPageActions', () => ({ fetchNinaAlbumPage, fetchNinaMediaPage }))

const { useSavePhoto } = vi.hoisted(() => ({ useSavePhoto: vi.fn() }))
// The save ladder is useSavePhoto's, covered by the ChatPhotoActions file from its own seam. Only
// the hook is stubbed; the shared notice wording stays real.
vi.mock('@/components/ui/useSavePhoto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/useSavePhoto')>()),
  useSavePhoto,
}))

// PhotoViewer is its own covered surface (swipe rules, wrap, keys). Here it is a probe: what this
// screen owes it is the right LIST per section, the right index, a close that lands, and — since
// 2026-10-01 — the right header CLUSTER for the photograph on screen. `rowPointer` is phase 3's
// `ViewerPhoto` field; the real overlay hands the slot `photos[index]` and so does this.
type ProbePhoto = { id?: string; rowPointer?: { kind: string; id: string } }
vi.mock('@/components/ui/PhotoViewer', () => ({
  PhotoViewer: (props: {
    photos: ProbePhoto[]
    index: number
    onClose: () => void
    headerAction?: (photo: ProbePhoto) => ReactNode
  }) => (
    <div data-testid="viewer" data-count={props.photos.length} data-index={props.index}>
      {props.headerAction?.(props.photos[props.index]!)}
      <button type="button" data-testid="viewer-close" onClick={props.onClose}>
        close
      </button>
    </div>
  ),
}))

// Real everything else: the codec, `aboutViewerLists`, the grids, the avatar.
import { COPY_ADMIN_LINK_LABEL } from '@/components/ui/CopyAdminLinkButton'
import { NinaAboutScreen } from './NinaAboutScreen'
import {
  NINA_ABOUT_PAGE_SIZE,
  NINA_ABOUT_PHOTO_PARAM,
  NINA_ATTACH_MAX_CHARS,
  type NinaAlbumPhoto,
  type NinaAvatarView,
  type NinaGalleryPhoto,
} from '@/lib/nina/album'
import { attachStripPadBottomCss, NINA_KEYBOARD_OVERLAP_VAR } from '@/lib/nina/chatview'
import { NINA_JOB_GONE_NOTE } from '@/lib/nina/jobview'

const AVATAR: NinaAvatarView = {
  id: 'a2',
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
    turnId: null,
  }
}

type Props = Parameters<typeof NinaAboutScreen>[0]

function props(overrides?: Partial<Props>): Props {
  return {
    avatar: AVATAR,
    album: [albumPhoto('a1'), albumPhoto('a2', true)],
    gallery: [galleryPhoto('c1', 'his'), galleryPhoto('c2', 'hers')],
    resolvedPhoto: null,
    returnTo: null,
    /* R4's default is the one that must be safe: a signed-in NON-admin. Every pre-existing case in
     * this file therefore asserts the header a stranger sees — including the job-link race case in
     * `NinaAboutScreen — the viewer`, which must keep passing unchanged. */
    adminLinkOrigin: null,
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
  fetchNinaAlbumPage.mockReset()
  fetchNinaMediaPage.mockReset()
  useSavePhoto.mockReset().mockReturnValue({
    busy: false,
    notice: null,
    warm: vi.fn(),
    save: vi.fn(),
  })
  routerPush.mockReset()
  routerRefresh.mockReset()
  routerReplace.mockReset()
  /* The common case every pre-existing overlay test assumes: the job behind the photograph is
   * still there. The deleted-job case overrides it. */
  ninaImageJobExists.mockReset().mockResolvedValue({ exists: true })
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

  it('opens on the Foto profil tab, marked active — Media is not shown until tapped', () => {
    renderScreen()
    expect(screen.getByRole('tab', { name: 'Foto profil' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Media' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByRole('button', { name: 'Foto kamu' })).not.toBeInTheDocument()
  })

  it('tapping the Media tab shows its grid and flips which tab is marked active', () => {
    renderScreen()
    fireEvent.click(screen.getByRole('tab', { name: 'Media' }))

    expect(screen.getByRole('tab', { name: 'Media' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Foto profil' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
    // Media, not absence: the gallery has rows, so the grid is there with honest labels.
    expect(screen.getByRole('button', { name: 'Foto kamu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Foto Nina' })).toBeInTheDocument()
  })

  it('an empty Media tab says so in its own sentence', () => {
    renderScreen({ gallery: [] })
    fireEvent.click(screen.getByRole('tab', { name: 'Media' }))
    expect(
      screen.getByText('Belum ada foto di chat. Kirim satu ke Nina, atau minta dia kirim.'),
    ).toBeInTheDocument()
  })

  it('switching tabs writes ?tab= into the URL via router.replace, never a navigation', () => {
    renderScreen()
    fireEvent.click(screen.getByRole('tab', { name: 'Media' }))
    expect(routerReplace).toHaveBeenCalledWith('/nina/about?tab=media')
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('switching back to Foto profil strips the tab parameter', () => {
    window.history.replaceState(null, '', '/nina/about?tab=media')
    renderScreen({ initialTab: 'media' })
    fireEvent.click(screen.getByRole('tab', { name: 'Foto profil' }))
    expect(routerReplace).toHaveBeenCalledWith('/nina/about')
  })
})

describe('NinaAboutScreen — pagination', () => {
  it('a single-page collection shows no Previous/Next row', () => {
    renderScreen()
    expect(screen.queryByText(/Halaman/)).not.toBeInTheDocument()
  })

  it('a multi-page collection shows the page line and the two controls', () => {
    renderScreen({ albumTotal: NINA_ABOUT_PAGE_SIZE + 15 })
    expect(screen.getByText(/Halaman 1 dari 2/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sebelumnya' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Berikutnya' })).toBeEnabled()
  })

  it('the controls are icon-only — the accessible name carries the word, not visible text', () => {
    renderScreen({ albumTotal: NINA_ABOUT_PAGE_SIZE + 15 })
    const prev = screen.getByRole('button', { name: 'Sebelumnya' })
    const next = screen.getByRole('button', { name: 'Berikutnya' })
    expect(prev.textContent?.trim()).toBe('')
    expect(next.textContent?.trim()).toBe('')
    expect(prev.querySelector('svg')).toBeInTheDocument()
    expect(next.querySelector('svg')).toBeInTheDocument()
  })

  it('the pager row is centered, not pinned to one edge', () => {
    renderScreen({ albumTotal: NINA_ABOUT_PAGE_SIZE + 15 })
    const row = screen.getByRole('button', { name: 'Sebelumnya' }).parentElement as HTMLElement
    expect(row.className).toContain('justify-center')
    expect(row.className).not.toContain('justify-between')
  })

  it('Berikutnya fetches the next page from the server and renders it — no navigation', async () => {
    fetchNinaAlbumPage.mockResolvedValue({
      items: [albumPhoto('a3'), albumPhoto('a4')],
      total: NINA_ABOUT_PAGE_SIZE + 15,
      page: 2,
    })
    renderScreen({ albumTotal: NINA_ABOUT_PAGE_SIZE + 15 })

    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }))
    expect(fetchNinaAlbumPage).toHaveBeenCalledWith(2)

    await waitFor(() => expect(screen.getByText(/Halaman 2 dari 2/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Sebelumnya' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Berikutnya' })).toBeDisabled()
    expect(routerPush).not.toHaveBeenCalled()
    expect(routerReplace).not.toHaveBeenCalled()
  })

  it('a page already fetched this mount is served from cache — no second server call', async () => {
    fetchNinaAlbumPage.mockResolvedValue({
      items: [albumPhoto('a3')],
      total: NINA_ABOUT_PAGE_SIZE + 15,
      page: 2,
    })
    renderScreen({ albumTotal: NINA_ABOUT_PAGE_SIZE + 15 })

    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }))
    await waitFor(() => expect(fetchNinaAlbumPage).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Sebelumnya' }))
    await waitFor(() => expect(screen.getByText(/Halaman 1 dari 2/)).toBeInTheDocument())
    // Page 1 was the server's own initial props — never re-fetched.
    expect(fetchNinaAlbumPage).toHaveBeenCalledTimes(1)
  })

  it('the Media tab pages independently through fetchNinaMediaPage', async () => {
    fetchNinaMediaPage.mockResolvedValue({
      items: [galleryPhoto('c9', 'his')],
      total: NINA_ABOUT_PAGE_SIZE * 2,
      page: 2,
    })
    renderScreen({ galleryTotal: NINA_ABOUT_PAGE_SIZE * 2 })
    fireEvent.click(screen.getByRole('tab', { name: 'Media' }))

    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }))
    expect(fetchNinaMediaPage).toHaveBeenCalledWith(2)
    expect(fetchNinaAlbumPage).not.toHaveBeenCalled()
  })
})

describe('NinaAboutScreen — a fresh server render must actually reach the grid', () => {
  it('a new album prop from router.refresh() replaces the one frozen at first mount', () => {
    const { rerender } = renderScreen()
    expect(
      document.querySelector('img[src="https://blob.example/album-a1.jpg"]'),
    ).toBeInTheDocument()

    rerender(<NinaAboutScreen {...props({ album: [albumPhoto('a3'), albumPhoto('a2', true)] })} />)

    expect(
      document.querySelector('img[src="https://blob.example/album-a1.jpg"]'),
    ).not.toBeInTheDocument()
    expect(
      document.querySelector('img[src="https://blob.example/album-a3.jpg"]'),
    ).toBeInTheDocument()
  })

  it('a new gallery prop is likewise adopted on the Media tab, not frozen at first mount', () => {
    const { rerender } = renderScreen()
    fireEvent.click(screen.getByRole('tab', { name: 'Media' }))
    expect(
      document.querySelector('img[src="https://blob.example/chat-c3.jpg"]'),
    ).not.toBeInTheDocument()

    rerender(
      <NinaAboutScreen
        {...props({
          gallery: [
            galleryPhoto('c3', 'his'),
            galleryPhoto('c1', 'his'),
            galleryPhoto('c2', 'hers'),
          ],
        })}
      />,
    )

    expect(
      document.querySelector('img[src="https://blob.example/chat-c3.jpg"]'),
    ).toBeInTheDocument()
  })

  it('a Previous/Next page already cached is dropped, not trusted, once a fresh render lands', async () => {
    fetchNinaAlbumPage.mockResolvedValue({
      items: [albumPhoto('a-page2')],
      total: NINA_ABOUT_PAGE_SIZE + 15,
      page: 2,
    })
    const { rerender } = renderScreen({ albumTotal: NINA_ABOUT_PAGE_SIZE + 15 })
    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }))
    await waitFor(() => expect(fetchNinaAlbumPage).toHaveBeenCalledTimes(1))

    // A fresh server render lands while the runner is sitting on page 2 — the cookie already
    // named page 2, so the server's own `albumPage` prop matches where they are.
    rerender(
      <NinaAboutScreen
        {...props({
          album: [albumPhoto('a-page2-edited')],
          albumTotal: NINA_ABOUT_PAGE_SIZE + 15,
          albumPage: 2,
        })}
      />,
    )
    expect(
      document.querySelector('img[src="https://blob.example/album-a-page2-edited.jpg"]'),
    ).toBeInTheDocument()

    // Paging away and back must re-fetch page 2 rather than serve the pre-refresh cache entry.
    fireEvent.click(screen.getByRole('button', { name: 'Sebelumnya' }))
    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }))
    await waitFor(() => expect(fetchNinaAlbumPage).toHaveBeenCalledTimes(2))
  })
})

describe('NinaAboutScreen — refresh on returning to the tab', () => {
  const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState')

  afterEach(() => {
    if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility)
  })

  it('refreshes when the tab becomes visible again', () => {
    renderScreen()
    routerRefresh.mockClear()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    fireEvent(document, new Event('visibilitychange'))
    expect(routerRefresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh on the transition into hidden', () => {
    renderScreen()
    routerRefresh.mockClear()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    fireEvent(document, new Event('visibilitychange'))
    expect(routerRefresh).not.toHaveBeenCalled()
  })
})

describe('NinaAboutScreen — the hero when the current avatar is off the loaded page', () => {
  it('opens the server-resolved current avatar, appended to the album viewer arm', () => {
    const resolvedCurrentAvatar = albumPhoto('a-current', true)
    renderScreen({
      album: [albumPhoto('a1'), albumPhoto('a2')], // neither is current — the loaded page missed it
      resolvedCurrentAvatar,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Lihat foto profil Nina ukuran penuh' }))
    expect(window.location.search).toBe(`?${NINA_ABOUT_PHOTO_PARAM}=album.a-current`)
  })

  it('with no resolver needed, the hero still opens the current photo already on the page', () => {
    renderScreen() // default fixture: a2 isCurrent, both on the loaded page
    fireEvent.click(screen.getByRole('button', { name: 'Lihat foto profil Nina ukuran penuh' }))
    expect(window.location.search).toBe(`?${NINA_ABOUT_PHOTO_PARAM}=album.a2`)
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
    fireEvent.click(screen.getByRole('tab', { name: 'Media' }))
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

  it('the job-detail link fires no close callback — a push must not race a history.back()', async () => {
    // The pushed `?photo=` entry is live here exactly as it is after any grid tap (`openAt`), so
    // this is the case that raced in production on the sidebar's search hits and wand
    // (`NinaSearchField.tsx`, `NinaSidebar.tsx`): if this control called `close()`, the resulting
    // `history.back()` would pop this same entry the instant it is tapped. `NinaJobDetailLink`
    // takes an `onNavigate` precisely so this screen can leave it unset; the assertion is that
    // this screen leaves it unset.
    at('chat', 'c1')
    renderScreen({
      gallery: [{ ...galleryPhoto('c1', 'his'), turnId: 'job-1' }, galleryPhoto('c2', 'hers')],
    })
    expect(viewer()).not.toBeNull()

    // No capture-phase `preventDefault` guard any more. happy-dom follows an anchor's `href` for
    // real once the event finishes — but since 2026-10-01 the control's own handler calls
    // `preventDefault` on every unmodified primary click (it has to: the navigation now happens
    // after a round trip), so there is no native navigation left to neutralise.
    fireEvent.click(screen.getByRole('link', { name: 'Buka detail job foto ini' }))

    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/nina/jobs/job-1'))
    // If `close` were wired, this default `returnTo: null` fixture would take its final branch and
    // strip the parameter via `replaceState` — observable here with no rerender needed, since it
    // is a direct write to the URL, not React state.
    expect(window.location.search).toBe(`?${NINA_ABOUT_PHOTO_PARAM}=chat.c1`)
    expect(viewer()).not.toBeNull()
  })

  it('a deleted job keeps the overlay, the URL and the history exactly as they were', async () => {
    // 2026-10-01: `turnId` is written when the photograph arrives and outlives the job row, which
    // `/nina/jobs`'s trash icon soft-deletes. The old `<Link>` walked the runner onto a 404; the
    // guarded control says one line and stays put. On THIS screen "stays put" is three facts, not
    // one — no push, no close, and no `replaceState` — because a navigation here would also have
    // consumed the pushed `?photo=` entry.
    ninaImageJobExists.mockResolvedValue({ exists: false })
    at('chat', 'c1')
    renderScreen({
      gallery: [{ ...galleryPhoto('c1', 'his'), turnId: 'job-1' }, galleryPhoto('c2', 'hers')],
    })

    fireEvent.click(screen.getByRole('link', { name: 'Buka detail job foto ini' }))

    expect(await screen.findByText(NINA_JOB_GONE_NOTE)).toBeInTheDocument()
    expect(routerPush).not.toHaveBeenCalled()
    expect(routerReplace).not.toHaveBeenCalled()
    expect(window.location.search).toBe(`?${NINA_ABOUT_PHOTO_PARAM}=chat.c1`)
    expect(viewer()).not.toBeNull()
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

describe('NinaAboutScreen — the copy-admin-link control (R1/R3/R4)', () => {
  const ORIGIN = 'https://runins.site'
  const copyButton = () => screen.queryByRole('button', { name: COPY_ADMIN_LINK_LABEL })

  // happy-dom provides no `navigator.clipboard`, and the control is CLIPBOARD-ONLY — phase 3's
  // component calls `navigator.clipboard.writeText` and never `navigator.share`. Without this the
  // component falls to its selectable-field rung, which would not fail the case but would leave a
  // stray input in the tree. Deleted in `afterEach` so the own-property does not leak into every
  // later file in the same worker.
  beforeEach(() => {
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })
  })

  afterEach(() => {
    delete (window.navigator as { clipboard?: unknown }).clipboard
  })

  it('rides the Foto profil (album) overlay, which had no header control at all before', () => {
    // The entry point the user named by hand: "/nina/about - Foto profil, click one image, and it
    // can do the copy-admin-link button as well". This arm passed `headerAction={undefined}`.
    at('album', 'a1')
    renderScreen({ adminLinkOrigin: ORIGIN })

    expect(viewer()).not.toBeNull()
    expect(copyButton()).toBeInTheDocument()
    // An avatar has no job behind it, so the album arm still draws exactly one control.
    expect(screen.queryByRole('link', { name: 'Buka detail job foto ini' })).not.toBeInTheDocument()
  })

  it('rides the Media overlay BESIDE the job link, not instead of it', () => {
    at('chat', 'c1')
    renderScreen({
      adminLinkOrigin: ORIGIN,
      gallery: [{ ...galleryPhoto('c1', 'his'), turnId: 'job-1' }, galleryPhoto('c2', 'hers')],
    })

    expect(copyButton()).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Buka detail job foto ini' })).toBeInTheDocument()
  })

  it('renders NOTHING extra for a signed-in non-admin, on either section', () => {
    // R4's half that matters, and the one the exit criteria call byte-identical: a stranger's
    // header is the header that shipped. A null origin means the payload carries nothing to hide.
    at('album', 'a1')
    const utils = renderScreen()
    expect(copyButton()).not.toBeInTheDocument()
    utils.unmount()

    at('chat', 'c1')
    renderScreen({
      gallery: [{ ...galleryPhoto('c1', 'his'), turnId: 'job-1' }, galleryPhoto('c2', 'hers')],
    })
    expect(copyButton()).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Buka detail job foto ini' })).toBeInTheDocument()
  })

  it('copying does not close the viewer or touch the pushed ?photo= entry', () => {
    // The measured 2026-09-08 race, stated for the new control: `close` fires
    // `window.history.back()` when this session pushed the `?photo=` entry, and this button
    // performs no navigation at all, so it must leave both the overlay and the URL exactly as they
    // were. Asserted on the URL because that is a direct history write, observable with no
    // rerender.
    at('chat', 'c1')
    renderScreen({ adminLinkOrigin: ORIGIN })

    fireEvent.click(screen.getByRole('button', { name: COPY_ADMIN_LINK_LABEL }))

    expect(window.location.search).toBe(`?${NINA_ABOUT_PHOTO_PARAM}=chat.c1`)
    expect(viewer()).not.toBeNull()
    expect(routerPush).not.toHaveBeenCalled()
  })
})
