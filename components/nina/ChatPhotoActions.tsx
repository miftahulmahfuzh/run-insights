'use client'

import { useCallback, useRef, useState } from 'react'

import { chooseSaveStrategy, saveFilenameFor } from '@/lib/photos/save'

/**
 * R10's two controls, floated at the bottom right of `PhotoViewer` through its `actions` slot.
 *
 * ── THE ONE HARD PROBLEM IN THIS FILE: `<a download>` IS NOT A DOWNLOAD ───────────────────────
 * The `download` attribute is honoured only for same-origin URLs, and every photo here lives on
 * `https://<store>.public.blob.vercel-storage.com/…`. Cross-origin, the attribute is ignored and
 * the browser NAVIGATES — the image opens and nothing is saved. On iOS that reads as a broken
 * button, and a control that looks like a download and is not one is worse than no control. So the
 * strategy is chosen (`chooseSaveStrategy`) rather than assumed, and there are three of them:
 *
 *   'share'    a phone. Fetch the bytes, wrap them in a `File`, and hand them to
 *              `navigator.share({ files })`. iOS's sheet offers **Save Image**, which lands the
 *              photo in Photos — where a photograph belongs, and where the runner will look for it.
 *   'download' a mouse, and a phone whose browser cannot share files. Fetch,
 *              `URL.createObjectURL`, click a synthetic `<a download>`. The object URL IS
 *              same-origin, so this is the one branch on which the attribute works.
 *   'open'     the bytes never arrived, or the sheet refused. Open the URL and say so: a long-press
 *              on a full-size image on iOS offers "Add to Photos", which is a real save needing no
 *              fetch, no CORS and no download permission. Never chosen up front — it is the rung
 *              below the other two, and the reason nobody ever gets nothing.
 *
 * ── TRANSIENT ACTIVATION, WHICH THIS REPO HAS ALREADY LOST ONCE ───────────────────────────────
 * `components/share/ShareButton.tsx:11-26`: *"`navigator.share()` may only be called while the
 * browser still considers a user gesture active. Safari's window is short and it does not survive
 * an `await` on a network round trip."* Fetching a ~150 KB photo is exactly such an await. **So the
 * fetch starts on `pointerdown`**, that file's fix verbatim: by the time `click` fires — one
 * finger-lift later, 60-150 ms — the `File` is usually already in hand and `share()` is reached
 * with nothing to await. When it is not, the await runs, Safari may refuse with `NotAllowedError`,
 * and that falls through to the anchor, which has no activation requirement at all.
 *
 * The warm is safe to fire on a pointer event because it is idempotent and free of side effects:
 * it is a GET of a public blob the runner is already looking at. `ShareButton`'s argument, and a
 * weaker requirement than its own (that one warms a Server Action).
 *
 * ── `AbortError` IS NOT AN ERROR ──────────────────────────────────────────────────────────────
 * Dismissing the share sheet rejects with `AbortError`. That is a person changing their mind and it
 * must produce **silence** — no notice, and no fallback download they did not ask for. Every other
 * rejection falls through.
 *
 * ── NO SUCCESS NOTICE ─────────────────────────────────────────────────────────────────────────
 * The browser's own download chrome and the platform's own sheet are the feedback. Printing
 * "Saved" after an anchor click would be a claim this component cannot verify, and in a
 * standalone-PWA Safari it could be a lie — which is the exact failure mode the strategy ladder
 * exists to avoid. The only copy on screen is for the paths where something genuinely needs saying.
 *
 * ── INVARIANT 5 ───────────────────────────────────────────────────────────────────────────────
 * This component renders no image and reads no private prose. Both accessible names come from the
 * `label` prop, which is `NINA_SIDE_LABEL` — a phrase about whose photograph it is, saying nothing
 * about what is in it. `glm-4.6v`'s text on the image row never crosses into `components/`.
 */

type SaveNotice =
  /** The URL was handed to the platform; the runner has to do the last step himself. */
  | 'opened'
  /** Nothing worked — offline, a blocked popup, a reaped blob. Say so, and say what to try. */
  | 'unavailable'

const SAVE_NOTICE_TEXT: Record<SaveNotice, string> = {
  opened: 'Fotonya kebuka di tab baru — tekan lama buat simpan ke galeri.',
  unavailable: 'Belum bisa diunduh. Coba lagi kalau koneksinya sudah stabil.',
}

/**
 * Can this platform share FILES, as opposed to only a URL?
 *
 * `canShare` inspects the SHAPE of the data and not its bytes, so a one-byte stand-in answers the
 * question exactly as the real photograph would. Asking before the fetch is what lets the strategy
 * be decided while the tap is still the current gesture.
 */
function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false
  try {
    return navigator.canShare({
      files: [new File([new Uint8Array(1)], 'probe.jpg', { type: 'image/jpeg' })],
    })
  } catch {
    return false
  }
}

export function ChatPhotoActions({
  url,
  label,
  onAttach,
}: {
  /** The public Blob URL of the photo currently on screen. */
  url: string
  /** `'Foto kamu'` or `'Foto Nina'`, from `chatViewerPhotos`. Both accessible names read off it. */
  label: string
  /**
   * Pin this photo to the next message. **`null` means the control does not render** — which is a
   * real state and not a bug: the image row's id reaches the client through `ChatMessage.imageIds`,
   * and an optimistic row for a message sent seconds ago has none, because the rows it describes
   * have not been written yet. Viewing and downloading still work on it.
   */
  onAttach: (() => void) | null
}) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<SaveNotice | null>(null)

  /**
   * The warmed fetch, keyed by the URL it was started for. A ref and not state: starting it must
   * not re-render, and paging to the next photo must invalidate it — comparing the key is cheaper
   * and less error-prone than an effect that nulls it out.
   */
  const warmed = useRef<{ url: string; file: Promise<File | null> } | null>(null)

  const fetchFile = useCallback(async (): Promise<File | null> => {
    try {
      /* `credentials: 'omit'` because a public blob needs none and sending them would turn a
       * simple request into a preflighted one for no gain. */
      const response = await fetch(url, { mode: 'cors', credentials: 'omit' })
      if (!response.ok) return null
      const blob = await response.blob()
      return new File([blob], saveFilenameFor(url, 'nina'), {
        type: blob.type || 'image/jpeg',
      })
    } catch {
      /* Offline, a reaped blob, or a CORS answer we did not expect. All three mean the same thing
       * to the caller — there are no bytes — and all three fall to the same fallback. */
      return null
    }
  }, [url])

  const warm = useCallback(() => {
    if (warmed.current?.url === url) return
    warmed.current = { url, file: fetchFile() }
  }, [url, fetchFile])

  /** The last rung, and the only one that ever prints anything. Never a dead end. */
  const openInstead = useCallback(() => {
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    setNotice(opened === null ? 'unavailable' : 'opened')
  }, [url])

  async function save() {
    setNotice(null)

    /* Decided BEFORE any await, so the probe reads the platform while the tap is still current. */
    const strategy = chooseSaveStrategy({
      canShareFiles: canShareFiles(),
      coarsePointer:
        typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    })

    setBusy(true)
    try {
      const pending = warmed.current?.url === url ? warmed.current.file : fetchFile()
      warmed.current = null
      const file = await pending

      if (file === null) {
        openInstead()
        return
      }

      if (strategy === 'share' && typeof navigator.share === 'function') {
        try {
          await navigator.share({ files: [file] })
          return
        } catch (error) {
          // The sheet was dismissed. Say nothing, do nothing.
          if (error instanceof Error && error.name === 'AbortError') return
          // Anything else — a closed activation window, an in-app browser with a broken
          // implementation, a revoked permission — falls through to the anchor below, which has no
          // activation requirement at all.
        }
      }

      const objectUrl = URL.createObjectURL(file)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = file.name
      anchor.rel = 'noopener'
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      /* Revoked on a timer and not in this tick: Safari has been observed to cancel a download
       * whose object URL was revoked synchronously after the click. Ten seconds is far longer than
       * a 150 KB save needs and costs one blob's worth of memory until it fires. */
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl)
      }, 10_000)
    } finally {
      setBusy(false)
    }
  }

  const noun = label.toLowerCase()

  return (
    <>
      {notice !== null && (
        <p
          role="status"
          className="max-w-[15rem] rounded-field bg-ink/85 px-2.5 py-1.5 text-right text-[12px] font-medium text-card/90"
        >
          {SAVE_NOTICE_TEXT[notice]}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onPointerDown={warm}
          onFocus={warm}
          onClick={save}
          disabled={busy}
          aria-busy={busy}
          aria-label={`Unduh ${noun}`}
          className="grid size-11 place-items-center rounded-pill bg-ink/70 text-card active:scale-[0.97] disabled:opacity-50"
        >
          {/* The send arrow's geometry, inverted, plus the tray it lands on. `Composer`'s icon
              idiom: one viewBox="0 0 24 24", one path, currentColor, strokeWidth 2.4. */}
          <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
            <path
              d="M12 4v11M7.5 10.5l4.5 4.5 4.5-4.5M5 19.5h14"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {onAttach !== null && (
          <button
            type="button"
            onClick={onAttach}
            aria-label={`Lampirkan ${noun} ke chat`}
            className="grid size-11 place-items-center rounded-pill bg-ink/70 text-card active:scale-[0.97]"
          >
            {/* A paperclip, and deliberately NOT `Composer`'s photo glyph: that one means "pick a
                photo from the phone", and this means "pin the photo already on screen". */}
            <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
              <path
                d="M13.5 3.5l-8 8a4 4 0 105.7 5.7l8-8a2.5 2.5 0 10-3.5-3.5l-8 8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </>
  )
}
