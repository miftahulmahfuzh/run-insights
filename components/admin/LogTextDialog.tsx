'use client'

import * as React from 'react'

import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

/**
 * The full-input / full-error popup for `/admin/error-logs` — R2's *"full input di rownya perlu
 * dibikin jadi tombol icon aja. klik tombol ini baru pop up nunjukin full input text nya"*, and
 * the same sentence again for the error message.
 *
 * ── ONE COMPONENT, TWO CALLERS, BECAUSE THE ONLY DIFFERENCE IS TWO STRINGS ──────────────────
 * The input popup and the error popup are the same box around a different `body`. A second
 * component would be a second set of dialog mechanics to keep correct, and the mechanics are the
 * only hard part here.
 *
 * ── WHY A NATIVE `<dialog>`, AND WHY NOT `DetailPanel` OR `Sheet` ───────────────────────────
 * `DetailPanel.tsx`'s header makes the whole argument and it carries over unchanged: the UA
 * supplies the focus trap, initial focus, `aria-modal`, Escape-to-cancel, focus restoration on
 * close, and the backdrop, with no application code. `app/globals.css:185-194` styles
 * `dialog::backdrop` ELEMENT-WIDE (a literal rgba in both schemes, because `::backdrop` inherits
 * from nothing in older engines and a `backdrop:` utility would compile to a colour it cannot
 * see), so this dialog gets the same scrim for free.
 *
 * **Do not add `role="dialog" aria-modal="true"`.** A redundant explicit role on a native
 * `<dialog>` is a known screen-reader hazard — the same note `DetailPanel` carries.
 *
 * What is NOT borrowed is the picture band. `DetailPanel`'s `art` prop is its reason to exist and
 * there is no picture here; a component that took `art={null}` forever would be a component whose
 * contract lies about it. The image link on a row goes to `PhotoViewer` instead, which is the
 * full-screen viewer the user pointed at (*"kita udah punya fitur ini pas klik satu image di
 * /nina/about"*).
 *
 * ── THE CLOSE BUTTON IS FOCUSED EXPLICITLY, AND AFTER `showModal()` ─────────────────────────
 * `DetailPanel`'s hard-won detail, and it matters MORE here. `showModal()` picks the dialog's own
 * focus delegate — the first focusable AREA, which is not the first tab stop — and the body below
 * is a scroll container, which Chromium makes a focusable area on its own. Without the explicit
 * focus the panel would open announcing "scrollable region" with a focus ring drawn across it.
 * React's `autoFocus` is not the same thing and is the wrong thing: it fires on MOUNT, one commit
 * BEFORE this effect, so the dialog would record a child of its own as the element to restore
 * focus to and drop focus to `<body>` on close — losing the row the operator tapped.
 */
export function LogTextDialog({
  open,
  title,
  body,
  onClose,
}: {
  open: boolean
  /** Names the dialog. `aria-labelledby` is wired internally so a caller cannot forget it. */
  title: string
  /** Rendered verbatim, wrapped, scrolling. Never truncated — the popup IS the full text. */
  body: string
  onClose: () => void
}) {
  const ref = React.useRef<HTMLDialogElement>(null)
  const closeRef = React.useRef<HTMLButtonElement>(null)
  const titleId = React.useId()

  /*
   * `showModal()` and `close()` are imperative and this component is declarative, so exactly one
   * effect reconciles them. Both `el.open` guards are load-bearing: `showModal()` on an
   * already-open dialog throws `InvalidStateError`, and React 19 Strict Mode double-invokes
   * effects in development.
   */
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) {
      el.showModal()
      closeRef.current?.focus()
    }
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      /* Escape fires `cancel` and closes the element itself. Telling React about it is what keeps
         DOM state and component state from diverging — without this the dialog is shut but the
         caller's selection is still set, and the next tap on the same icon appears to do nothing. */
      onCancel={onClose}
      /* A click on the backdrop targets the <dialog> itself, because the panel is its child. This
         is the robust form; comparing pointer coordinates against a bounding box breaks when a
         text selection is dragged out of the panel and released over the backdrop — and this
         panel's whole content is text a reader will drag over. */
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      /* Wider than `DetailPanel`'s 360px cap: the body is a JSON payload or a stack trace, not a
         caption. `calc(100vw-2rem)` is 343px on a 375px screen and 382px on an XS Max, and the cap
         only bites on a desktop. `88dvh` and not `92dvh` because there is no picture band to
         justify the extra height, and `dvh` follows Safari's retracting toolbar. */
      className={cn(
        'm-auto max-h-[88dvh] w-[calc(100vw-2rem)] max-w-[720px] overflow-hidden p-0',
        'rounded-card bg-card text-ink shadow-sheet',
      )}
    >
      {/* Nothing is rendered while closed. A `<dialog>` with `display: none` still has its subtree
          in the document, and a several-kilobyte provider error behind a shut panel is text a
          screen reader can reach in the reading order of every other element on the page. */}
      {open && (
        <div className="flex max-h-[88dvh] flex-col">
          <h2
            id={titleId}
            className="shrink-0 px-5 pt-5 pb-3 text-[13px] leading-[1.35] font-semibold break-words text-ink"
          >
            {title}
          </h2>

          {/* The half that gives when the panel cannot fit the viewport; the title and the footer
              keep their size. `whitespace-pre-wrap` so a JSON payload's own newlines survive and
              `break-words` so one unbroken 4000-character token cannot widen the dialog instead of
              wrapping inside it — `components/admin/ImageGenPanel.tsx:836` is the same `<pre>` at
              the same size, with `break-words` added for the payloads this page shows. */}
          <pre className="min-h-0 flex-1 overflow-auto overscroll-contain px-5 font-mono text-[12px] leading-relaxed break-words whitespace-pre-wrap text-ink-2">
            {body}
          </pre>

          {/* `DetailPanel`'s footer verbatim: `pt-3` against the body, `1rem` plus the home-
              indicator inset below, and nothing edited so there is no rule above the button. */}
          <div className="shrink-0 px-5 pt-3 pb-[calc(1rem+var(--safe-bottom))]">
            <Button ref={closeRef} variant="secondary" size="md" fullWidth onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )
}
