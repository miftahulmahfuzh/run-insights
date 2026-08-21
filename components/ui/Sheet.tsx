'use client'

import * as React from 'react'

import { cn } from '@/lib/cn'

/**
 * The bottom sheet — the app's one modal surface.
 *
 * A sheet rather than a page for the same reason the expense tracker's `ItemSheet` is one:
 * correcting km 11 is a detour, not a destination. The splits table has to stay where it was, in
 * the same scroll position, so the reviewer can check the next row against the same screenshot
 * without re-finding their place.
 *
 * Three behaviours that are not decoration:
 *
 *  - **The backdrop scrolls-locks the body.** Without it iOS scrolls the page behind the sheet
 *    when the keyboard opens, and the reviewer loses the row they were editing.
 *  - **Focus moves in on open and back out on close.** A sheet you can tab behind is a sheet a
 *    keyboard user cannot use, and every field in here is a text input.
 *  - **The panel is capped at 88dvh and scrolls internally**, with the header and footer pinned.
 *    The source screenshot lives in the scrolling body; `Save` must never be below the fold.
 */

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  /** Rendered under the title in the pinned header — a source-photo caption, typically. */
  subtitle?: React.ReactNode
  /** Pinned to the bottom, outside the scroll area. */
  footer?: React.ReactNode
  children: React.ReactNode
}

export function Sheet({ open, onClose, title, subtitle, footer, children }: SheetProps) {
  const panelRef = React.useRef<HTMLDivElement>(null)
  const titleId = React.useId()

  React.useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    // The panel itself, not the first input: opening a sheet must not raise the iOS keyboard
    // before the reviewer has decided which field they came here for.
    panelRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* A button, not a div with onClick: it is a real dismiss control and belongs in the
          accessibility tree with a name, not as an invisible click surface. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[88dvh] w-full max-w-[470px] flex-col',
          'rounded-t-card bg-card shadow-sheet outline-none',
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-rule-2 px-5 pt-5 pb-4">
          <div>
            <h2 id={titleId} className="text-[19px] font-semibold text-ink">
              {title}
            </h2>
            {subtitle && (
              <div className="mt-0.5 text-[12px] font-medium text-ink-3">{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-1 grid size-11 place-items-center rounded-pill text-[19px] font-semibold text-ink-3"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>

        {footer && (
          <footer className="border-t border-rule-2 px-5 pt-4 pb-[calc(1.25rem+var(--safe-bottom))]">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
