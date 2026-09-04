'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/Button'
import { PhotoViewer, type ViewerPhoto } from '@/components/ui/PhotoViewer'
import { NinaPhotoGrid, type NinaGridCell } from './NinaPhotoGrid'
import { NinaAvatar } from './NinaAvatar'
import { attachNinaPhotoToChat } from '@/lib/nina/albumActions'
import {
  NINA_ATTACH_MAX_CHARS,
  type NinaAlbumPhoto,
  type NinaAvatarView,
  type NinaGalleryPhoto,
} from '@/lib/nina/album'

/**
 * `/nina/about` — her detail page, the WhatsApp shape R17 asked for.
 *
 * Three tap levels, and each one is a real history entry:
 *
 *   1. `/nina`'s header avatar  ->  this page          (a route; `<Link>` does it)
 *   2. this page's hero         ->  the album, zoomed   (`?photo=album.<id>`, pushed)
 *   3. any grid cell            ->  that photo, zoomed  (same parameter)
 *
 * ── ONE VIEWER, AND IT IS THE ONE THAT ALREADY EXISTS ─────────────────────────────────────────
 * `components/ui/PhotoViewer.tsx` is the full-screen swipeable overlay R17 describes, and it is
 * already correct in ways a second one would not be: `decideSwipe`'s three rules keep the browser's
 * own pinch-zoom and momentum panning alive, `stepIndex`'s double modulo makes a backward swipe off
 * the FIRST photo land on the last, and the arrow keys page through the same function so they
 * cannot drift from the gesture. F18 unified those; a second viewer here would be a defect, not a
 * feature, and this phase's exit criteria say so.
 *
 * ── THE TWO SECTIONS ARE ONE VIEWER LIST EACH, DELIBERATELY ───────────────────────────────────
 * Swiping inside the album should not wander into his chat photos and back. So `section` selects
 * which list the viewer is over, and paging wraps within it — which is also what makes
 * `stepIndex`'s wrap read correctly against the dot row at the bottom.
 *
 * ── RU-18: THE ALBUM IS A SET OF DIFFERENT FACES, AND NOTHING HERE APOLOGISES FOR IT ──────────
 * The generation anchor is dropped, so consecutive photos are different-looking women. There is no
 * grouping, no "most like her" ordering and no note on screen about it. Newest first, that is all.
 */

type Section = 'album' | 'chat'

interface Open {
  section: Section
  index: number
}

const PHOTO_PARAM = 'photo'

/** `album.pr0000000001`. `.` and not `:` because `URLSearchParams` leaves `.` unencoded. */
function encodePhoto(section: Section, id: string): string {
  return `${section}.${id}`
}

function decodePhoto(raw: string | null): { section: Section; id: string } | null {
  if (raw == null) return null
  const dot = raw.indexOf('.')
  if (dot <= 0) return null
  const section = raw.slice(0, dot)
  const id = raw.slice(dot + 1)
  if (id.length === 0) return null
  if (section !== 'album' && section !== 'chat') return null
  return { section, id }
}

export function NinaAboutScreen({
  avatar,
  album,
  gallery,
}: {
  avatar: NinaAvatarView
  album: readonly NinaAlbumPhoto[]
  gallery: readonly NinaGalleryPhoto[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [question, setQuestion] = React.useState('')
  const [attaching, setAttaching] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)

  const albumViewer: ViewerPhoto[] = React.useMemo(
    () => album.map((photo) => ({ url: photo.url, kind: photo.kind, label: photo.label })),
    [album],
  )
  const galleryViewer: ViewerPhoto[] = React.useMemo(
    () => gallery.map((photo) => ({ url: photo.url, kind: photo.kind, label: photo.label })),
    [gallery],
  )

  /**
   * **The open photo is DERIVED from the URL, never mirrored into state** — `usePanelParam`'s
   * shape, and the reason this file cites it rather than merely resembling it.
   *
   * `pushState` and `replaceState` integrate with the Next router (16.3.1's "Native History API"
   * note, which `usePanelParam`'s header quotes in full), so `useSearchParams` re-renders on our
   * own writes AND on the phone's back gesture. That leaves nothing for a `popstate` listener to
   * do and nothing for a mount effect to synchronise: a deep link, a refresh, a tap and a
   * back-swipe all arrive through this one line. Holding a parallel `useState` would be two
   * sources of truth for one fact, and the second would be the one that goes stale.
   *
   * A stale or malformed id resolves to `null` — the viewer simply does not open, which is
   * `lib/panel/param.ts`'s rule and its reason: a deleted photo must close a panel, not crash one.
   */
  const open: Open | null = React.useMemo(() => {
    const parsed = decodePhoto(searchParams.get(PHOTO_PARAM))
    if (parsed == null) return null
    const list = parsed.section === 'album' ? album : gallery
    const index = list.findIndex((photo) => photo.id === parsed.id)
    if (index < 0) return null
    return { section: parsed.section, index }
  }, [album, gallery, searchParams])

  /**
   * Whether THIS mount pushed the entry the parameter is sitting on.
   *
   * A ref and not state, and reset through an effect exactly as `usePanelParam` resets its own:
   * the back gesture drops the parameter, `open` recomputes to null, and the next open must push a
   * fresh entry rather than believe it still owns the popped one.
   */
  const pushedRef = React.useRef(false)
  React.useEffect(() => {
    if (open === null) pushedRef.current = false
  }, [open])

  /** One writer for the parameter, so no caller can set it without going through the codec. */
  const urlWithPhoto = React.useCallback((value: string | null) => {
    const url = new URL(window.location.href)
    if (value === null) url.searchParams.delete(PHOTO_PARAM)
    else url.searchParams.set(PHOTO_PARAM, value)
    return url.toString()
  }, [])

  const openAt = React.useCallback(
    (section: Section, index: number) => {
      const list = section === 'album' ? album : gallery
      const photo = list[index]
      if (photo == null) return
      setQuestion('')
      setNotice(null)
      window.history.pushState(null, '', urlWithPhoto(encodePhoto(section, photo.id)))
      pushedRef.current = true
    },
    [album, gallery, urlWithPhoto],
  )

  /** Paging inside the open section. `replaceState`, so twelve swipes are not twelve backs. */
  const onIndex = React.useCallback(
    (index: number) => {
      if (open == null) return
      const list = open.section === 'album' ? album : gallery
      const photo = list[index]
      if (photo == null) return
      window.history.replaceState(null, '', urlWithPhoto(encodePhoto(open.section, photo.id)))
    },
    [album, gallery, open, urlWithPhoto],
  )

  /**
   * `back()` when we pushed, `replaceState` when we did not — `usePanelParam`'s rule, for its
   * reason. A deep link or a refresh of `/nina/about?photo=…` arrives with the parameter already
   * set and no entry of ours underneath it; calling `back()` there would navigate off the app.
   */
  const close = React.useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false
      window.history.back()
      return
    }
    window.history.replaceState(null, '', urlWithPhoto(null))
  }, [urlWithPhoto])

  /** R26. `''` is a valid question: attaching with nothing to ask must work. */
  const attach = React.useCallback(async () => {
    if (open == null || attaching) return
    const list = open.section === 'album' ? album : gallery
    const photo = list[open.index]
    if (photo == null) return
    setAttaching(true)
    setNotice(null)
    try {
      const result = await attachNinaPhotoToChat({
        kind: open.section === 'album' ? 'avatar' : 'image',
        id: photo.id,
        body: question,
      })
      if (!result.ok) {
        setNotice('Gagal kirim fotonya. Coba lagi.')
        return
      }
      /* Refresh first, so the pushed `/nina` renders the row that was just written. */
      router.refresh()
      router.push('/nina')
    } finally {
      setAttaching(false)
    }
  }, [album, attaching, gallery, open, question, router])

  const currentAlbumIndex = Math.max(
    0,
    album.findIndex((photo) => photo.isCurrent),
  )

  return (
    <>
      <div className="mb-7 flex flex-col items-center">
        <button
          type="button"
          onClick={() => openAt('album', currentAlbumIndex)}
          aria-label="Lihat foto profil Nina ukuran penuh"
          className="rounded-pill"
        >
          <NinaAvatar size="xl" src={avatar.src} natural={avatar.natural} crop={avatar.crop} />
        </button>
        <h1 className="mt-3 text-[26px] leading-none font-bold tracking-[-0.02em] text-ink">
          Nina
        </h1>
        <p className="mt-1 text-[11px] font-medium text-ink-3">
          Reads every run. Says what she thinks.
        </p>
      </div>

      <section className="mb-7">
        <h2 className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
          Foto profil
        </h2>
        <NinaPhotoGrid cells={album.map(toCell)} onOpen={(index) => openAt('album', index)} />
      </section>

      <section>
        <h2 className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
          Media
        </h2>
        {gallery.length === 0 ? (
          <p className="text-[13px] text-ink-3">
            Belum ada foto di chat. Kirim satu ke Nina, atau minta dia kirim.
          </p>
        ) : (
          <NinaPhotoGrid cells={gallery.map(toCell)} onOpen={(index) => openAt('chat', index)} />
        )}
      </section>

      {open != null && (
        <>
          <PhotoViewer
            photos={open.section === 'album' ? albumViewer : galleryViewer}
            index={open.index}
            onIndex={onIndex}
            onClose={close}
            subject="foto"
          />
          {/*
            The attach control sits ABOVE the overlay (z-70 against its z-60) rather than inside
            it, and that is deliberate: `PhotoViewer` is shared with three review surfaces that
            must not grow an F33 button, and its bottom row is already the dot pager. A fixed strip
            over it costs that component nothing.
          */}
          <div className="fixed inset-x-0 bottom-0 z-70 flex flex-col gap-2 bg-ink/95 px-4 pt-3 pb-[calc(1rem+var(--safe-bottom))]">
            {notice != null && (
              <p className="text-[12px] font-medium text-card/80" role="status">
                {notice}
              </p>
            )}
            <input
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={NINA_ATTACH_MAX_CHARS}
              placeholder="Tanya soal foto ini (opsional)"
              aria-label="Pertanyaan tentang foto ini"
              className="w-full rounded-field bg-card/10 px-3 py-2 text-[15px] text-card placeholder:text-card/50"
            />
            <Button size="md" onClick={attach} disabled={attaching}>
              {attaching ? 'Mengirim…' : 'Kirim ke chat'}
            </Button>
          </div>
        </>
      )}
    </>
  )
}

/** Both photo types are already `{ id, url, label }` plus, for the album, `isCurrent`. */
function toCell(photo: NinaAlbumPhoto | NinaGalleryPhoto): NinaGridCell {
  return {
    id: photo.id,
    url: photo.url,
    label: photo.label,
    isCurrent: (photo as NinaAlbumPhoto).isCurrent === true,
  }
}
