'use client'

import * as React from 'react'

import { createShareLinkAction } from '@/app/actions/share'
import { SHARE_ACTION, SHARE_COPIED, SHARE_COPY_FAILED } from '@/lib/share/copy'

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
        className="text-[13px] font-semibold text-accent disabled:opacity-50"
      >
        {status === 'copied' ? SHARE_COPIED : SHARE_ACTION}
      </button>

      {status === 'manual' && url && <ManualLink url={url} />}
      {status === 'manual' && !url && (
        <span className="text-[11px] font-medium text-red">{SHARE_COPY_FAILED}</span>
      )}
    </>
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
