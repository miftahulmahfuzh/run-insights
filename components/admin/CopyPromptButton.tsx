'use client'

import * as React from 'react'

/** How long the checkmark stands in for the copy glyph, same hold `ShareButton.tsx` uses. */
const COPY_HOLD_MS = 2000

/**
 * **Icon-only "put this prompt on the clipboard" control.**
 *
 * Lifted out of `ImageGenTestPanel.tsx` on 2026-10-01, when the "Prompt as sent" block it used to
 * sit in was purged — *"purge Prompt as sent section. using The assembled image prompt is enough"*
 * — and its one surviving job, the copy, moved to the header of "The assembled image prompt"
 * (`ImageGenPanel.tsx`). It is `ShareButton.tsx`'s copy-and-revert shape without the
 * `navigator.share()` branch, since this text never leaves the clipboard: a prompt is pasted into
 * an editor or a chat, never shared to an app, and a share sheet would be a modal standing between
 * the operator and the single thing the control is named after — the same ruling
 * `CopyAdminLinkButton.tsx` records for its own surface.
 *
 * **Positioning is the caller's**, through `className`. The one mount is absolutely positioned
 * over a `<details>` header, and a component that hard-coded its own corner could only ever have
 * that one mount.
 *
 * `aria-label` carries the verb; the glyph is `aria-hidden` — the accessible name is the control's,
 * never the picture's (`components/admin/photoIcons.tsx`'s rule for the repo). A clipboard write is
 * otherwise completely invisible, so the live region says it once.
 */
export function CopyPromptButton({
  /** The exact text written to the clipboard. An empty string disables the button. */
  text,
  /** The control's name, in the idle state — e.g. "Copy the assembled image prompt". */
  label,
  /** Layout only. The caller owns where this sits; the component owns how it behaves. */
  className,
}: {
  text: string
  label: string
  className?: string
}) {
  const [status, setStatus] = React.useState<'idle' | 'copied' | 'failed'>('idle')

  React.useEffect(() => {
    if (status === 'idle') return
    const timer = window.setTimeout(() => setStatus('idle'), COPY_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  async function onClick() {
    try {
      await navigator.clipboard.writeText(text)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
  }

  const name = status === 'copied' ? 'Copied' : label

  return (
    <>
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={text === ''}
        aria-label={name}
        title={name}
        className={`inline-flex shrink-0 p-1 text-accent disabled:opacity-40 ${className ?? ''}`}
      >
        {status === 'copied' ? <CheckIcon /> : <CopyIcon />}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {status === 'copied' ? 'Copied' : status === 'failed' ? 'Could not copy' : ''}
      </span>
    </>
  )
}

/** Two overlapping rectangles — the standard "copy" glyph, same line weight as `ShareButton.tsx`. */
function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
      <rect
        x="8.5"
        y="8.5"
        width="11"
        height="11"
        rx="1.8"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M15.5 8.5V6.3a1.8 1.8 0 0 0-1.8-1.8H6.3a1.8 1.8 0 0 0-1.8 1.8v7.4a1.8 1.8 0 0 0 1.8 1.8h2.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The copied confirmation, for {@link COPY_HOLD_MS}. Same box as `CopyIcon`, so the row never shifts. */
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
