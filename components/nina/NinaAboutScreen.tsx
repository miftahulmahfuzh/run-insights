'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/Button'
import { PhotoViewer, type ViewerPhoto } from '@/components/ui/PhotoViewer'
import { attachStripPadBottomCss, NINA_KEYBOARD_OVERLAP_VAR } from '@/lib/nina/chatview'
import { NinaJobList } from './NinaJobList'
import { NinaPhotoGrid, type NinaGridCell } from './NinaPhotoGrid'
import { NinaAvatar } from './NinaAvatar'
import { KeyboardOverlapPublisher } from './KeyboardOverlapPublisher'
import {
  attachNinaPhotoToChat,
  deleteNinaChatPhoto,
  type NinaAttachTarget,
} from '@/lib/nina/albumActions'
import {
  NINA_ABOUT_PHOTO_PARAM,
  NINA_ATTACH_MAX_CHARS,
  aboutViewerLists,
  decodeAboutPhoto,
  encodeAboutPhoto,
  type NinaAlbumPhoto,
  type NinaAvatarView,
  type NinaGalleryPhoto,
  type NinaViewerSection,
} from '@/lib/nina/album'
import { NINA_JOBS_HREF, type NinaJobListItem } from '@/lib/nina/jobview'

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

/**
 * Which list the viewer is over. The union and its whole codec live in `lib/nina/album.ts` now:
 * the server page has to parse the very parameter this screen derives its open state from, and
 * two parsers of one grammar in two files is how grammars drift. The local alias keeps this
 * file's word for it.
 */
type Section = NinaViewerSection

interface Open {
  section: Section
  index: number
}

export function NinaAboutScreen({
  avatar,
  album,
  gallery,
  jobs,
  jobsNowMs,
  resolvedPhoto,
}: {
  avatar: NinaAvatarView
  album: readonly NinaAlbumPhoto[]
  gallery: readonly NinaGalleryPhoto[]
  /**
   * **R3's rows, in phase 4's own shape and never in this screen's words.**
   *
   * This section is a summary of `/nina/jobs`, so the one thing it must never do is describe a job
   * row for itself — that is how two surfaces start disagreeing about what `dispatched` looks like,
   * and the one the runner sees is whichever page he happened to open. `NinaJobListItem` is
   * `lib/nina/jobview.ts`'s, already mapped by `toNinaJobListItems` on the server (its
   * `createdAtMs` is a number precisely so it can cross this boundary), and when phase 4 widens the
   * projection again nothing here changes.
   */
  jobs: readonly NinaJobListItem[]
  /** The server's clock at render, for the elapsed tickers. See the page. */
  jobsNowMs: number
  /**
   * **A photograph the URL names but the gallery window dropped — resolved on the server, or
   * null.** Optional and nullable, and both absences are the SAME answer downstream.
   *
   * `?photo=chat.<id>` used to open only when the id sat inside `gallery` — the newest
   * `NINA_GALLERY_LIMIT` originals — so a photograph older than the window resolved to
   * `index < 0` and the viewer silently did not open. The page now falls such a miss through
   * `getNinaMessageImage` (the deep-link read; it never filters references, so a re-attached
   * album face re-opens too) and maps the row through `galleryPhotos([row])[0]` before handing it
   * here — the mapping is what strips `description`, `glm-4.6v`'s private prose, from the row
   * (invariant 5). A deleted or foreign id arrives as `null` and behaves exactly like the old
   * miss: a closed viewer, never an error.
   *
   * The photo is VIEWER-ONLY. `aboutViewerLists` appends it to the chat arm of the viewer's lists
   * and to nothing else; the Media grid keeps mapping the `gallery` prop (invariant 8).
   */
  resolvedPhoto?: NinaGalleryPhoto | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [question, setQuestion] = React.useState('')
  /* Which send is in flight — `'recent'` or `'new'` — or `null` when neither is. One flight for
   * two controls: it names the button that shows the dots and disables the other one. */
  const [sending, setSending] = React.useState<NinaAttachTarget | null>(null)
  /** The delete's own flight, shared with the sends: nothing in the row is reachable mid-delete. */
  const [deleting, setDeleting] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)
  /**
   * R3. The keyboard's overlap in px, mirrored from the publisher mounted below. The strip's
   * `bottom` reads the `:root` var and needs no state; this mirror exists only for the NUMBER the
   * padding gate wants (`attachStripPadBottomCss`) — the same division `ChatScreen` draws between
   * its `overlap` state and the var the sidebar panel reads.
   */
  const [kbOverlap, setKbOverlap] = React.useState(0)

  /** `undefined` (prop absent) and `null` (the server proved nothing) are one value here. */
  const resolvedChatPhoto = resolvedPhoto ?? null

  /**
   * One list per section, in render order. `aboutViewerLists`' whole job is appending the
   * resolved photo to the chat arm and to nothing else. Every reader below (`open`, `openAt`,
   * `onIndex`, `attach`, `openChatPhoto`) goes through THIS object rather than the raw props, so
   * the viewer's indices and its id reads cannot drift from the list the viewer actually shows.
   */
  const viewerLists = React.useMemo(
    () => aboutViewerLists({ album, gallery, resolvedChatPhoto }),
    [album, gallery, resolvedChatPhoto],
  )

  const albumViewer: ViewerPhoto[] = React.useMemo(
    () =>
      viewerLists.album.map((photo) => ({ url: photo.url, kind: photo.kind, label: photo.label })),
    [viewerLists],
  )
  const galleryViewer: ViewerPhoto[] = React.useMemo(
    () =>
      viewerLists.chat.map((photo) => ({ url: photo.url, kind: photo.kind, label: photo.label })),
    [viewerLists],
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
   * `lib/panel/param.ts`'s rule and its reason: a deleted photo must close a panel, not crash
   * one. What changed with `resolvedPhoto` is only WHICH ids can be stale: the chat arm now
   * carries one row the gallery list does not, so an out-of-window deep link resolves here too,
   * and an id the server could not resolve still falls out the bottom as `null`.
   */
  const open: Open | null = React.useMemo(() => {
    const parsed = decodeAboutPhoto(searchParams.get(NINA_ABOUT_PHOTO_PARAM))
    if (parsed == null) return null
    const list = viewerLists[parsed.section]
    const index = list.findIndex((photo) => photo.id === parsed.id)
    if (index < 0) return null
    return { section: parsed.section, index }
  }, [viewerLists, searchParams])

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
    if (value === null) url.searchParams.delete(NINA_ABOUT_PHOTO_PARAM)
    else url.searchParams.set(NINA_ABOUT_PHOTO_PARAM, value)
    return url.toString()
  }, [])

  const openAt = React.useCallback(
    (section: Section, index: number) => {
      const list = viewerLists[section]
      const photo = list[index]
      if (photo == null) return
      setQuestion('')
      setNotice(null)
      window.history.pushState(null, '', urlWithPhoto(encodeAboutPhoto(section, photo.id)))
      pushedRef.current = true
    },
    [viewerLists, urlWithPhoto],
  )

  /** Paging inside the open section. `replaceState`, so twelve swipes are not twelve backs. */
  const onIndex = React.useCallback(
    (index: number) => {
      if (open == null) return
      const list = viewerLists[open.section]
      const photo = list[index]
      if (photo == null) return
      window.history.replaceState(null, '', urlWithPhoto(encodeAboutPhoto(open.section, photo.id)))
    },
    [open, viewerLists, urlWithPhoto],
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

  /**
   * R26 still: `''` is a valid question, and attaching with nothing to ask must work. R1/R2 add
   * the target — his most recent conversation, or a fresh one — and it is the SERVER that decides
   * which conversation that is and where to land: this handler names the button and pushes the
   * `next` the action returns, and spells no URL of its own.
   */
  const attach = React.useCallback(
    async (target: NinaAttachTarget) => {
      if (open == null || sending !== null) return
      const list = viewerLists[open.section]
      const photo = list[open.index]
      if (photo == null) return
      setSending(target)
      setNotice(null)
      try {
        const result = await attachNinaPhotoToChat({
          kind: open.section === 'album' ? 'avatar' : 'image',
          id: photo.id,
          body: question,
          target,
        })
        if (!result.ok || result.next === null) {
          setNotice('Gagal kirim fotonya. Coba lagi.')
          return
        }
        /* Refresh first, so the pushed conversation renders the row that was just written. */
        router.refresh()
        router.push(result.next)
      } finally {
        setSending(null)
      }
    },
    [open, question, router, sending, viewerLists],
  )

  /**
   * The photograph under the viewer, and whether THIS screen offers its delete.
   *
   * `open?.section === 'chat'` is doing narrowing work, not spelling preference: only the chat
   * list's rows carry a `side`, and the delete exists for exactly one of the two — **HIS
   * photographs only** ("Foto kamu"). Hers are the operator's collection, and their Remove lives
   * on `/admin/photos`, where the carrier-message logic a generated row needs already ships. An
   * album cell is an avatar: there is no delete there and never has been. The hidden control is
   * not the authorization either — the action refuses a `generated` id on its own — but the
   * runner is never shown a button the server would refuse.
   */
  const openChatPhoto = open?.section === 'chat' ? viewerLists.chat[open.index] : undefined
  const deletable = openChatPhoto != null && openChatPhoto.side === 'his'

  /**
   * One tap, gone — the runner's recorded posture on destructive controls ("remove the
   * confirmation message when user delete nina's message, and also when user delete his own"):
   * a dialog here would re-litigate that ruling one photograph at a time.
   *
   * Success does not navigate and does not mutate state to close the viewer: the grid is server
   * props, so `router.refresh()` re-reads it without the deleted row, and `open` — derived from
   * the URL against the refreshed list — resolves to null and closes the overlay by itself. The
   * refusal shows the same sentence every other failure on this strip shows, because "not his"
   * and "not there" are one outcome across this boundary by design.
   */
  const removePhoto = React.useCallback(async () => {
    if (openChatPhoto == null || deleting || sending !== null) return
    setDeleting(true)
    setNotice(null)
    try {
      const result = await deleteNinaChatPhoto({ id: openChatPhoto.id })
      if (!result.ok) {
        setNotice('Gagal menghapus foto. Coba lagi.')
        return
      }
      router.refresh()
    } finally {
      setDeleting(false)
    }
  }, [deleting, openChatPhoto, router, sending])

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

      <section className="mb-7">
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

      {/*
        ── R3: THE IMAGE-GENERATION TRACKING SECTION, DIRECTLY BELOW MEDIA ─────────────────────
        Verbatim: *"put this image generation tracking section below media section (after user
        click nina profpic)"*. "After user click nina profpic" is this route, and "below media
        section" is this position — the last section on the page, after the album and the chat
        photos, which is also the honest ordering: the album is what she has, Media is what the
        conversation has, and this is what is still on its way.

        ── IT REUSES PHASE 4'S LIST, IT DOES NOT REIMPLEMENT IT ───────────────────────────────
        `NinaJobList` is `/nina/jobs`'s own list component and `listNinaImageJobs` is `/nina/jobs`'s
        own read, bounded here by `ABOUT_JOB_LIMIT`. A second row renderer is exactly the drift F18
        unified away for `ScreenshotStrip`'s arrows and their swipe, and the same argument holds
        harder for a job's stage: two renderers means two opinions about what `dispatched` looks
        like, and the one the runner sees is whichever page he happened to open.

        ── AND THAT INCLUDES THE EMPTY CASE ──────────────────────────────────────────────────
        There is no `jobs.length === 0` branch here, deliberately. `NinaJobList` renders absence
        itself and takes the WORDS from `emptyText`, which is the division of labour its own
        docstring sets out: "absence is one sentence, worded by the CALLER — /nina/jobs says
        something different from a section under Media." So this screen supplies its sentence and
        phase 4 supplies the markup. Branching here would be a second empty renderer for job rows,
        which is the same drift one element down.

        The section still renders when there is nothing to show. Media, twelve lines up, renders
        its caption and a sentence rather than disappearing, and two adjacent sections disagreeing
        about that is louder than either choice on its own. It is also the likelier render than it
        looks: `nina_message_images` has had zero rows for the life of the app, which is the whole
        reason this plan set exists.

        NOT `components/ui/EmptyState.tsx`, and nothing here reaches for it. That component is a
        dashed *card outline* for a whole screen; this screen has no cards.

        ── "SEMUA" IS NAVIGATION, NOT A COUNT ────────────────────────────────────────────────
        It goes to the full list; it does not claim more exist. Knowing that would cost a count
        query or a `limit + 1` probe, and this page's docstring is a promise about how few reads it
        makes. `NINA_JOBS_HREF` rather than the literal, so this link, the sidebar entry and the
        detail page's "SEMUA JOB" cannot drift apart. Hidden when there are no jobs, because
        `/nina/jobs` is empty then too and a link into a blank page is worse than no link.
      */}
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
            Pembuatan foto
          </h2>
          {jobs.length > 0 && (
            <Link
              href={NINA_JOBS_HREF}
              className="text-[11px] font-semibold text-ink-2 transition-colors hover:text-ink"
            >
              Semua
            </Link>
          )}
        </div>
        <NinaJobList
          items={jobs}
          nowMs={jobsNowMs}
          emptyText="Belum ada foto yang dibuat. Minta Nina kirim foto lewat chat."
        />
      </section>

      {open != null && (
        <>
          {/*
            ── R3: THE KEYBOARD CHANNEL, MOUNTED SCOPED TO THE OPEN VIEWER ───────────────────────
            `ChatScreen` is not mounted on this route (`app/nina/about/page.tsx` renders this
            screen inside `AppShell` and nothing else), so nothing published
            `--nina-kb-overlap` here and the strip below had NO keyboard protection at all — the
            member of the class with strictly less than the sidebar panel, which at least had the
            var and the reassert.

            Page-level vs scoped-to-open: SCOPED, deliberately. This publisher's only reader is
            the strip, and the strip exists only while `open != null`, so a page-level mount would
            run a `visualViewport` subscription with no consumer — and would publish a var that
            nothing on this route reads while no photo is open. The cost side is nil: the
            subscriber starts before the strip can be tapped (same commit), and its unmount
            removes the var, so closing the viewer leaves nothing behind. The invariant holds by
            construction: `/nina` and `/nina/about` are different routes, never mounted together,
            so this is never a second concurrent subscription on one screen.
          */}
          <KeyboardOverlapPublisher onOverlap={setKbOverlap} />
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
          {/*
            ── R3: THE BOX FIX, `NinaSidebar.tsx`'s EXACT PATTERN ────────────────────────────────
            iOS does not shrink the layout viewport when the keyboard opens, so this strip —
            `fixed` at `bottom-0`, inside no scroll container — runs on behind the keys and
            Safari's focus reveal answers by lifting the whole fixed overlay off the top of the
            glass: the field the runner just tapped leaves through the top of the screen, which is
            the bug he reported. Ending the strip at the keyboard's MEASURED top edge puts the
            field inside the visible region — the same fix the composer ships as
            `composerBottomCss`, reached here as a `:root` custom property because the
            subscription lives in the publisher above.

            An inline style rather than a Tailwind arbitrary value, because it must beat
            `bottom-0`'s `bottom: 0` in the cascade without depending on utility sort order. The
            string is CONSTANT — it never re-renders, whatever the keyboard does; the var
            underneath it is what moves. Absent (no keyboard, Android, pre-hydration) it
            substitutes `0px`, which is exactly `bottom-0`, so the resting strip and the server's
            HTML never differ. The edge SNAPS with the keyboard — no transition on `bottom` — and
            that is kept deliberately: the strip has no `transition-all` to accidentally catch the
            property, and a lagging edge would chase the keyboard's own animation and read as a
            glitch (`decideAutoScroll`'s 'viewport' rule).

            ── WHY THE BOX ALONE IS THE WHOLE CURE HERE, AND NO REASSERT IS NEEDED ──────────────
            The sidebar needed a reassert because its field sits INSIDE an `overflow-y-auto`
            deck, and Safari's reveal scrolls THAT CONTAINER — a scrollTop no box can unscroll.
            This strip is inside no scroll container at all, the composer's distinguishing fact,
            and the composer's recorded outcome from exactly this shape was "the composer never
            lifts". The padding gate is the one refinement the box needs: with the strip's bottom
            edge on the keys, the old `1rem + var(--safe-bottom)` floor would hold the input row
            ~50 px off the keyboard — padding by a floor that is behind the keyboard, which is the
            same class of mistake `composerPadBottomCss`'s docstring records. `attachStripPadBottomCss`
            is that function's gate on this bar's own floor.
          */}
          <div
            className="fixed inset-x-0 bottom-0 z-70 flex flex-col gap-2 bg-ink/95 px-4 pt-3"
            style={{
              bottom: `var(${NINA_KEYBOARD_OVERLAP_VAR}, 0px)`,
              paddingBottom: attachStripPadBottomCss(kbOverlap),
            }}
          >
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
            {/*
              R1/R2: THE TWO SENDS WEAR GLYPHS; THE WORDS BECAME THE ACCESSIBLE NAMES —
              SessionRow's three menu buttons are the pattern and its header is the record. The
              glyph is `aria-hidden` decor, the word it replaced is the `aria-label` verbatim
              ("Kirim ke chat"; the new one extends it), and the control stays a `Button` because
              everything the guard needs lives there: `loading` swaps the glyph for pulsing dots
              inside an unchanged box, `md` keeps the 44px floor.

              `variant="secondary"`, and not the default `primary`: primary is `bg-ink text-card`
              and this strip is `bg-ink/95`, so the shipped button was ink-on-ink — a slab a shade
              darker than its own surface. The light `bg-paper-2 text-ink` disc is how SessionRow's
              menu already reads on a dark panel. `flex-1` on each: the row the full-width labelled
              button owned, split into two adjacent controls, the original send on the left.

              ONE flight, TWO controls: `sending` names which one fired, so only that one shows
              dots, and `disabled={sending !== null}` on BOTH keeps the other unreachable mid-send —
              the loading/disabled split of the rename form's Simpan/Batal row, one flight wider.
            */}
            <div className="flex gap-2">
              <Button
                size="md"
                variant="secondary"
                className="flex-1"
                loading={sending === 'recent'}
                disabled={sending !== null || deleting}
                aria-label="Kirim ke chat"
                onClick={() => attach('recent')}
              >
                <SendHorizontalIcon />
              </Button>
              <Button
                size="md"
                variant="secondary"
                className="flex-1"
                loading={sending === 'new'}
                disabled={sending !== null || deleting}
                aria-label="Kirim ke chat baru"
                onClick={() => attach('new')}
              >
                <MessageSquarePlusIcon />
              </Button>
              {/*
                ── THE DELETE: HIS MEDIA PHOTOGRAPHS ONLY, AND THE ROW'S THIRD GLYPH ──────────
                Square and not `flex-1`, on the row's end: the two sends are this strip's reason
                for existing and share the width between them, while delete is the one control
                here that ends something — it takes the space its risk earns, no more. Rendered
                only when the open photo is a chat photograph of his (`deletable` above), shown
                with NO confirmation step — the runner's own overrule on destructive controls —
                and sharing the row's one flight: `deleting` dots inside this button, both sends
                dead until it settles.
              */}
              {deletable && (
                <Button
                  size="md"
                  variant="secondary"
                  loading={deleting}
                  disabled={sending !== null || deleting}
                  aria-label="Hapus foto"
                  onClick={removePhoto}
                >
                  <TrashIcon />
                </Button>
              )}
            </div>
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

/*
 * The strip's three glyphs, inlined rather than imported — `SessionRow`'s collection note and
 * `AdminNav`'s before it. All are **Lucide** (lucide-static 1.42.0, ISC), fetched 2026-09-09 from
 * `unpkg.com/lucide-static@1.42.0/icons/<name>.svg` and copied verbatim — the paths and the root's
 * presentation attributes exactly as published; the only adaptations are JSX spelling
 * (`stroke-width` -> `strokeWidth`) and dropping lucide's own `class`, `width` and `height` for
 * our `className` and the 18px size. Every glyph is 18px in `currentColor` and `aria-hidden` — the
 * accessible name is the `aria-label` on the button, never the picture.
 *
 * `send-horizontal` is the paper plane every chat app uses for "send", lying sideways so it reads
 * at 18px on the row that fires it (lucide's `send` is the same arrow at 45 degrees; the
 * horizontal one reads better beside a full-width input row). `message-square-plus` is the
 * sidebar rail's own noun — `NewChatButton`'s `plus` on a chat-bubble body — the one glyph in the
 * app that already means "a conversation that does not exist yet", which is exactly what this
 * button sells. `trash-2` is the delete-with-content glyph — the can plus the two strokes that
 * say something is IN it, which is the difference between "clear this" and "this had a photograph
 * in it" — and it is the row's third icon, not a variant of either send.
 */

/** "Kirim ke chat" — his most recent conversation. Lucide's `send-horizontal`, verbatim. */
function SendHorizontalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.842 7.627a.498.498 0 0 0 .682.627l18-8.5a.5.5 0 0 0 0-.904z" />
      <path d="M6 12h16" />
    </svg>
  )
}

/** "Kirim ke chat baru" — a conversation with no prior content. Lucide's `message-square-plus`, verbatim. */
function MessageSquarePlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
      <path d="M12 8v6" />
      <path d="M9 11h6" />
    </svg>
  )
}

/** "Hapus foto" — his photograph leaves the Media grid and, when nothing else needs it, the store. Lucide's `trash-2`, verbatim. */
function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}
