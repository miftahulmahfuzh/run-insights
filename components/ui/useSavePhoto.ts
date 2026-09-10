'use client'

import { useCallback, useRef, useState } from 'react'

import { chooseSaveStrategy, saveFilenameFor } from '@/lib/photos/save'

/**
 * The machinery behind every "download this photograph" control, lifted verbatim out of
 * `components/nina/ChatPhotoActions.tsx` when the same three verbs it serves — the chat viewer's
 * floating pair (F35 R10), `/nina/about`'s attach strip and the two admin rails — each needed a
 * button of their own. The impure half of `lib/photos/save.ts`'s split (`ChatPhotoActions.tsx:10`
 * quotes the module's own reason: `vitest` runs `environment: 'node'`, so everything that can be
 * decided without a browser is decided there, and everything that cannot lives here, in one copy).
 *
 * ── THE ONE HARD PROBLEM, RESTATED FOR THIS FILE ──────────────────────────────────────────────
 * `<a download>` is not a download. The attribute is honoured only for same-origin URLs, and every
 * photo here lives on `https://<store>.public.blob.vercel-storage.com/…`. Cross-origin, the
 * attribute is ignored and the browser NAVIGATES — the image opens and nothing is saved. So the
 * strategy is chosen (`chooseSaveStrategy`) rather than assumed, and there are three of them:
 *
 *   'share'    a phone. Fetch the bytes, wrap them in a `File`, and hand them to
 *              `navigator.share({ files })`. iOS's sheet offers **Save Image**, which lands the
 *              photo in Photos — where a photograph belongs, and where the runner will look for it.
 *   'download' a mouse, and a phone whose browser cannot share files. Fetch,
 *              `URL.createObjectURL`, click a synthetic `<a download>`. The object URL IS
 *              same-origin, so this is the one branch on which the attribute works.
 *   'open'     the bytes never arrived, or the sheet refused. Open the URL and let the caller say
 *              so: a long-press on a full-size image on iOS offers "Add to Photos", which is a real
 *              save needing no fetch, no CORS and no download permission. Never chosen up front —
 *              it is the rung below the other two, and the reason nobody ever gets nothing.
 *
 * ── TRANSIENT ACTIVATION, WHICH THIS REPO HAS ALREADY LOST ONCE ───────────────────────────────
 * `components/share/ShareButton.tsx:11-26`: *"`navigator.share()` may only be called while the
 * browser still considers a user gesture active. Safari's window is short and it does not survive
 * an `await` on a network round trip."* Fetching a photo is exactly such an await. **So the fetch
 * starts on `pointerdown`** — call `warm` from that event, and `onFocus` for keyboards — by the
 * time `click` fires, one finger-lift later, the `File` is usually already in hand and `share()` is
 * reached with nothing to await. When it is not, the await runs, Safari may refuse with
 * `NotAllowedError`, and that falls through to the anchor, which has no activation requirement at
 * all. The warm is safe to fire on a pointer event because it is idempotent and free of side
 * effects: it is a GET of a public blob the person is already looking at.
 *
 * ── `AbortError` IS NOT AN ERROR ──────────────────────────────────────────────────────────────
 * Dismissing the share sheet rejects with `AbortError`. That is a person changing their mind and it
 * must produce **silence** — no notice, and no fallback download they did not ask for. Every other
 * rejection falls through.
 *
 * ── NO SUCCESS NOTICE ─────────────────────────────────────────────────────────────────────────
 * The browser's own download chrome and the platform's own sheet are the feedback. Printing
 * "Saved" after an anchor click would be a claim this hook cannot verify, and in a standalone-PWA
 * Safari it could be a lie — which is the exact failure mode the strategy ladder exists to avoid.
 * The only notice is `SaveNotice`, for the two paths where something genuinely needs saying, and
 * its WORDS belong to the caller: the chat surface and `/nina/about` share the runner-facing
 * Indonesian `SAVE_NOTICE_TEXT` below, the admin rails word their own English.
 */

export type SaveNotice =
  /** The URL was handed to the platform; the person has to do the last step himself. */
  | 'opened'
  /** Nothing worked — offline, a blocked popup, a reaped blob. Say so, and say what to try. */
  | 'unavailable'

/** The runner-facing wording, shared by every surface that speaks Indonesian to him. */
export const SAVE_NOTICE_TEXT: Record<SaveNotice, string> = {
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

/**
 * The one save flight for one photograph. `url` is the public Blob URL currently on screen, and
 * `prefix` names the file (`saveFilenameFor`'s contract). `null` — a closed viewer — arms nothing:
 * `warm` and `save` no-op, so a caller may hold the hook unconditionally at its top level and
 * render its button only while a photo is open.
 */
export function useSavePhoto(
  url: string | null,
  prefix: string,
): {
  /** True from the click until the bytes are saved, refused, or handed to the platform. */
  busy: boolean
  /** The last rung's outcome, or `null`. Cleared by the next `save()`, not by time. */
  notice: SaveNotice | null
  /** Start the fetch early — `onPointerDown`, and `onFocus` for keyboard users. */
  warm: () => void
  /** The whole ladder: share, else the object-URL anchor, else open and report. */
  save: () => Promise<void>
} {
  const [busy, setBusy] = useState(false)
  /**
   * The notice is stored WITH the URL it was reported for and derived against the current one,
   * never cleared by an effect: `react-hooks/set-state-in-effect` refuses the sync, and the
   * derivation is the honest shape anyway. A new photograph is a fresh slate — the notice names
   * the PREVIOUS photo's last rung, and a stale "opened in a new tab" beside a different image
   * would be a lie about the one on screen — which is the same invalidation the warm ref below
   * performs on this very change. Callers that remount per photo (the admin rails, keyed by id)
   * reset through their mount; a caller that holds the hook across photos (`/nina/about`'s strip)
   * resets through this derivation.
   */
  const [reported, setReported] = useState<{ url: string; notice: SaveNotice } | null>(null)
  const notice = reported !== null && reported.url === url ? reported.notice : null

  /**
   * The warmed fetch, keyed by the URL it was started for. A ref and not state: starting it must
   * not re-render, and paging to the next photo must invalidate it — comparing the key is cheaper
   * and less error-prone than an effect that nulls it out.
   */
  const warmed = useRef<{ url: string; file: Promise<File | null> } | null>(null)

  const fetchFile = useCallback(async (): Promise<File | null> => {
    if (url === null) return null
    try {
      /* `credentials: 'omit'` because a public blob needs none and sending them would turn a
       * simple request into a preflighted one for no gain. */
      const response = await fetch(url, { mode: 'cors', credentials: 'omit' })
      if (!response.ok) return null
      const blob = await response.blob()
      return new File([blob], saveFilenameFor(url, prefix), {
        type: blob.type || 'image/jpeg',
      })
    } catch {
      /* Offline, a reaped blob, or a CORS answer we did not expect. All three mean the same thing
       * to the caller — there are no bytes — and all three fall to the same fallback. */
      return null
    }
  }, [url, prefix])

  const warm = useCallback(() => {
    if (url === null || warmed.current?.url === url) return
    warmed.current = { url, file: fetchFile() }
  }, [url, fetchFile])

  /** The last rung, and the only one that ever prints anything. Never a dead end. */
  const openInstead = useCallback(() => {
    if (url === null) return
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    setReported({ url, notice: opened === null ? 'unavailable' : 'opened' })
  }, [url])

  const save = useCallback(async () => {
    if (url === null) return
    setReported(null)

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
       * a photo save needs and costs one blob's worth of memory until it fires. */
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl)
      }, 10_000)
    } finally {
      setBusy(false)
    }
  }, [fetchFile, openInstead, url])

  return { busy, notice, warm, save }
}
