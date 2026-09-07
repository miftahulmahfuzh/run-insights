'use client'

import * as React from 'react'

import { createShareLinkAction } from '@/app/actions/share'
import { SHARE_COPIED, SHARE_COPY_FAILED, SHARE_TITLE } from '@/lib/share/copy'

/**
 * How long the checkmark stands in for the share glyph after a clipboard copy.
 *
 * The label used to say "Copied" forever, which was harmless for a word and is wrong for an icon:
 * a permanently-ticked button has stopped reading as a share button. Long enough to be seen on a
 * glance down at the phone, short enough that the row is itself again before the next tap.
 */
const COPIED_HOLD_MS = 2000

/**
 * The header action on `/r/[id]`. One tap from "this is my run" to "the link is in WhatsApp".
 *
 * ── THE ONE HARD PROBLEM IN THIS FILE: TRANSIENT ACTIVATION ────────────────────────────────────
 * `navigator.share()` may only be called while the browser still considers a user gesture active.
 * Safari's window is short and it does not survive an `await` on a network round trip — so the
 * obvious implementation (click → mint the token → share) fails on the exact platform this app is
 * built for, with `NotAllowedError`, on the first share of every run.
 *
 * **The fix is to start the mint on `pointerdown`.** By the time `click` fires — one finger-lift
 * later, typically 60–150 ms — the token is usually already in hand and `navigator.share()` is
 * reached synchronously inside the gesture. When it is not, the `await` runs and Safari may refuse;
 * that path falls through to the clipboard, which has no activation requirement, and the runner gets
 * a "Copied" they can paste. Nobody ever gets nothing.
 *
 * The mint is safe to fire on a hover-ish event because it is **idempotent by design** (see
 * `createShareLinkAction`): a second call returns the same live token and writes nothing. Warming
 * cannot create a second link, and it cannot create a link the user did not ask for, because
 * `pointerdown` on this button *is* the ask.
 *
 * ── `AbortError` IS NOT AN ERROR ───────────────────────────────────────────────────────────────
 * Dismissing the iOS share sheet rejects the promise with `AbortError`. That is a person changing
 * their mind, and it must produce **silence** — no toast, no "sharing failed", no fallback copy
 * they did not ask for. Every other rejection falls through to the clipboard.
 *
 * ── WHY IT IS A GLYPH AND NOT THE WORD "SHARE" ─────────────────────────────────────────────────
 * Card #108: `/r/[id]`'s action row held two words and one icon, which reads as an unfinished row
 * rather than as a deliberate mix. It is three glyphs now.
 *
 * That cost this component its cheapest affordance — the label WAS the confirmation, and on the
 * clipboard path it was the only thing on screen that changed. So the tick below is not decoration:
 * it is `SHARE_COPIED` in its other form, and the `sr-only` live region is the same sentence for a
 * reader who cannot see it. Deleting either one silently un-fixes the copy path.
 */
export function ShareButton({
  runId,
  /**
   * The absolute URL of the run's live share, or null. Built server-side from `AUTH_URL`
   * (`lib/share/origin.ts`) and passed in so that a run which is ALREADY shared needs no mint at
   * all — the click handler reaches `navigator.share()` with nothing to await, which is the only
   * shape Safari's transient-activation window reliably permits.
   */
  url: initialUrl,
}: {
  runId: string
  url: string | null
}) {
  const [status, setStatus] = React.useState<'idle' | 'copied' | 'manual'>('idle')
  const [url, setUrl] = React.useState<string | null>(initialUrl)
  const [pending, setPending] = React.useState(false)

  // The warmed mint. A ref, not state: starting it must not re-render, and the click handler needs
  // whatever the latest pointerdown produced, not a value captured at render time.
  const warming = React.useRef<Promise<string | null> | null>(null)

  /*
   * The checkmark's own clock. `'manual'` deliberately does NOT expire — that state is showing the
   * runner a link to select by hand, and yanking it away mid-drag would be the rudest thing this
   * component could do. Only the success tick reverts.
   */
  React.useEffect(() => {
    if (status !== 'copied') return
    const timer = window.setTimeout(() => setStatus('idle'), COPIED_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  const mint = React.useCallback(async (): Promise<string | null> => {
    const result = await createShareLinkAction(runId)
    return result.ok ? result.url : null
  }, [runId])

  const warm = React.useCallback(() => {
    if (url || warming.current) return
    warming.current = mint()
  }, [mint, url])

  async function onClick() {
    setPending(true)
    try {
      const link = url ?? (await (warming.current ?? mint()))
      warming.current = null
      if (!link) {
        setStatus('manual')
        return
      }
      setUrl(link)

      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
          // Deliberately title-and-url only. No `text`: WhatsApp renders its own preview card from
          // the URL (§3.6), and a `text` field would put a second, uncontrolled description in the
          // message body next to it.
          await navigator.share({ title: 'A run', url: link })
          setStatus('idle')
          return
        } catch (error) {
          // The user closed the sheet. Say nothing, do nothing.
          if (error instanceof Error && error.name === 'AbortError') {
            setStatus('idle')
            return
          }
          // Anything else — no permission, an in-app browser with a broken implementation, a
          // desktop with the API present but non-functional — falls through to the clipboard.
        }
      }

      try {
        await navigator.clipboard.writeText(link)
        setStatus('copied')
      } catch {
        // Clipboard refused too (insecure context, or a browser that gates it). Last rung: put the
        // URL on screen in a field the runner can select. Never a dead end.
        setStatus('manual')
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onPointerDown={warm}
        onFocus={warm}
        onClick={onClick}
        disabled={pending}
        aria-busy={pending}
        aria-label={status === 'copied' ? SHARE_COPIED : SHARE_TITLE}
        title={status === 'copied' ? SHARE_COPIED : SHARE_TITLE}
        className="-m-1 inline-flex p-1 text-accent disabled:opacity-50"
      >
        {status === 'copied' ? <CheckIcon /> : <ShareIcon />}
      </button>

      {/*
        The confirmation the label used to be. Swapping this button's `aria-label` is not enough on
        its own: a name change on an element that is not focused is not reliably announced, and the
        runner who most needs to hear "Copied" is the one whose share sheet never opened. A live
        region says it once, out of the layout, in the row that must stay three glyphs wide.
      */}
      <span role="status" aria-live="polite" className="sr-only">
        {status === 'copied' ? SHARE_COPIED : ''}
      </span>

      {status === 'manual' && url && <ManualLink url={url} />}
      {status === 'manual' && !url && (
        <span className="text-[11px] font-medium text-red">{SHARE_COPY_FAILED}</span>
      )}
    </>
  )
}

/**
 * The platform share mark — a tray with an arrow leaving it. The one glyph an iPhone runner reads
 * without being taught, which matters here because this button really does open the OS share sheet.
 *
 * `strokeWidth` 1.8 and `size-5`: the row's other two glyphs, not the 2/2.4 of Nina's filled pill
 * buttons. This is thin accent-coloured line work on paper.
 */
function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
      <path
        d="M12 3.5v11"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.2 7.3 12 3.5l3.8 3.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 10.5H6a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 6 20.5h12a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The `SHARE_COPIED` confirmation, for {@link COPIED_HOLD_MS}. Same box, so the row never shifts. */
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
      <path
        d="m5 12.5 4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The bottom rung: the URL, selectable, read-only.
 *
 * `readOnly` rather than `disabled` — a disabled input cannot be selected, which defeats the entire
 * purpose of showing it. `onFocus` selects the whole value so one tap plus the platform's own
 * "Copy" gets there without any API at all.
 */
function ManualLink({ url }: { url: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="text-[11px] font-medium text-ink-3">{SHARE_COPY_FAILED}</span>
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Share link"
        className="min-w-0 flex-1 rounded-field bg-paper-2 px-2 py-1 text-[11px] font-medium text-ink"
      />
    </span>
  )
}
