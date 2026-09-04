'use client'

import { useRef, useState } from 'react'

import { cn } from '@/lib/cn'

/**
 * The message composer: a fixed bar above the tab bar, an auto-growing textarea, one send button.
 *
 * ── IT OWNS ITS OWN TEXT, AND THAT IS A BUG FIX WRITTEN IN ADVANCE ────────────────────────────
 * `value` lives here, not in `ChatScreen`, so a keystroke re-renders this component and nothing
 * above it. `components/ui/Sheet.tsx` carries the report of what happens otherwise: an unstable
 * dependency reaching a focused input made "focus leave the input and iOS dropped the keyboard —
 * one digit per keyboard". A composer is that bug's natural habitat. The rules that follow from it:
 * this component is never given a `key` that changes, and `onSend` is a `useCallback` upstream.
 *
 * ── THE FIXED BAR'S GEOMETRY ──────────────────────────────────────────────────────────────────
 * `bottomCss` is computed by `composerBottomCss` in `lib/nina/chatview.ts` and clears 78 px of
 * chrome: the tab bar's 58 px plus the Upload FAB's 20 px overhang above the bar's top edge. The
 * FAB is not optional to clear — the composer is at `z-40` and the bar at `z-30`, so a bar sitting
 * flush on the tab bar's top edge would slice the top off the coral circle. The home-indicator
 * inset rides in that same offset rather than in this element's padding, because the tab bar below
 * already pads by it and counting it twice would open a gap.
 *
 * `z-40` matches `ReviewClient`'s sticky action bar, the app's only other second fixed bar, and
 * leaves `Sheet` (`z-50`) and `PhotoViewer` (`z-60`) covering it. `bg-paper/90 backdrop-blur-md` is
 * that file's recipe too.
 *
 * ── 16px, AND WHY IT IS NOT NEGOTIABLE ────────────────────────────────────────────────────────
 * `app/globals.css` sets `input, select, textarea { font-size: max(16px, 1rem) }` because Safari
 * zooms the viewport when you focus anything smaller, and the design brief makes that one of the
 * iOS rules that beat the design. So this is the one place on the screen where text is 16px rather
 * than the bubble's 15px, and no `text-[15px]` may be added here to "fix" it.
 *
 * `CONTROL_CLASS` from `components/ui/Field.tsx` is not reused: it is `h-[52px]` and
 * `tabular-nums`, built for a fixed-height numeric field. An auto-growing prose textarea shares
 * its radius and its fill and nothing else, so it borrows those two literally rather than
 * inheriting a shape that fights it.
 *
 * ── THE SEND BUTTON IS 44px, AND DISABLING IT IS NOT A VALIDATION MESSAGE ─────────────────────
 * `size-11` is the iOS floor, the same as every other icon-only button in the app.
 * `ReviewClient`'s rule — "NEVER disabled for validation… a greyed-out button with no explanation
 * is the least useful message an app can send" — is about a rule the user has broken and cannot
 * see. This is not that: an empty box is the explanation, and there is nothing to send.
 */

/** Roughly five lines at 16px, after which the textarea scrolls instead of growing. */
const TEXTAREA_MAX_PX = 132

export function Composer({
  onSend,
  busy,
  bottomCss,
}: {
  /**
   * Receives the trimmed body. Must be referentially stable — see the docstring.
   *
   * `void | Promise<void>` rather than `void`: `ChatScreen`'s handler is async, and while an
   * async function is assignable to a `void`-returning type, spelling the union means nobody has
   * to know that to read this signature.
   */
  onSend: (body: string) => void | Promise<void>
  /** A turn is in flight. The box stays editable; only sending is held. */
  busy: boolean
  /** From `composerBottomCss`. A CSS length, because `var(--safe-bottom)` is CSS-only. */
  bottomCss: string
}) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const canSend = value.trim().length > 0 && !busy

  function resize() {
    const el = ref.current
    if (el == null) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`
  }

  function submit() {
    if (!canSend) return
    void onSend(value.trim())
    setValue('')
    const el = ref.current
    if (el != null) {
      el.style.height = 'auto'
      // Keep the keyboard up. He is going to type again — that is what a conversation is.
      el.focus()
    }
  }

  return (
    <div
      className="fixed inset-x-0 z-40 border-t border-rule bg-paper/90 backdrop-blur-md"
      style={{ bottom: bottomCss }}
    >
      <div className="mx-auto flex max-w-[470px] items-end gap-2 px-5 py-3">
        {/* Phases 6 and 8 add `size-11` icon buttons to the left of the textarea, in this row. */}
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            resize()
          }}
          onKeyDown={(event) => {
            /*
             * Enter sends; Shift+Enter is a newline. `enterKeyHint="send"` relabels the iOS return
             * key so the phone agrees with the behaviour. `isComposing` is the guard that keeps an
             * IME's own Enter — committing a candidate — from firing the message half-typed.
             */
            if (event.key !== 'Enter' || event.shiftKey) return
            if (event.nativeEvent.isComposing) return
            event.preventDefault()
            submit()
          }}
          enterKeyHint="send"
          placeholder="Message Nina"
          aria-label="Message Nina"
          className={cn(
            'max-h-[132px] min-h-11 w-full resize-none rounded-field bg-card px-4 py-2.5',
            'text-base font-medium text-ink outline-none',
            'placeholder:font-medium placeholder:text-ink-3',
            'focus-visible:ring-2 focus-visible:ring-accent',
          )}
        />

        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label="Send"
          className="grid size-11 shrink-0 place-items-center rounded-pill bg-ink text-card transition-opacity active:scale-[0.97] disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
            <path
              d="M12 19V5M6 11l6-6 6 6"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}
