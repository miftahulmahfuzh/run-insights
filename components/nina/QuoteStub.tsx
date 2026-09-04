'use client'

import { cn } from '@/lib/cn'
import { QUOTE_MEDIA_LABEL, type QuoteView } from '@/lib/nina/reply'

/**
 * The WhatsApp-style quoted strip (R12), in two places: above a message's text, and above the
 * composer's input while a reply is being composed.
 *
 * ── IT IS A BUTTON, AND THAT IS THE WHOLE INTERACTION ─────────────────────────────────────────
 * R12: "clicking this reply to will automatically scroll to that message in history". So the stub
 * is a real `<button>` — tappable, focusable, reachable by VoiceOver and by a keyboard, with
 * `min-h-11` because the design brief's 44pt floor "wins over any conflicting design output". In
 * the composer there is nothing to scroll to yet, so `onJump` is omitted and it renders as an
 * inert `<div>` with the cancel control beside it.
 *
 * ── THE FILL IS ONE CLASS ON BOTH GROUNDS (RULING E1) ─────────────────────────────────────────
 * `bg-ink-3/20`, and it is a verified value rather than a hope. Phase 4 flagged that `bg-paper-2`
 * inside a `bg-ink` bubble inverts between colour schemes, and the reason generalises: `--paper-2`
 * is a *page-level* token chosen to sit just off `--paper`, while the runner's bubble is `--ink`,
 * whose relationship to `--paper` flips between light and dark. `--ink-3` does not flip — it is
 * `#93a2b0` in light and `#7c8d9b` in dark (`app/globals.css`), a mid-grey in both — so an alpha
 * of it composites *toward* whatever it sits on and reads as a recessed panel over `bg-ink` (his
 * bubble), over `bg-card` (hers) and over `bg-paper` (the composer), with no per-side branch at
 * all. Phases 6, 8 and 13 use the same class for the same reason.
 *
 * `bg-current/10` — phase 8's proposal — lost on evidence, not taste: its own plan admitted the
 * arbitrary-opacity-on-`currentColor` support was unverified in this Tailwind setup, and an
 * unverified mechanism must not be the shared answer for four phases.
 *
 * Only the left rule and the two text colours still branch, and deliberately: the accent is a
 * mark, not a surface, and cyan on near-white ink in dark mode is the contrast failure `Button`'s
 * docstring measured. The rule itself is 2px of `border-l`, the blockquote convention every reader
 * already knows and the strongest "this is a quote" signal available without an icon. It is not
 * the border the token file forbids — that rule is about outlining *surfaces* instead of using
 * fill and shadow, and this is a mark inside a surface, not an outline around one.
 *
 * The preview is 13px — the app's body size — deliberately one step below the bubble's 15px, so
 * the quote reads as subordinate to the message quoting it. `line-clamp-2` is the visual cap that
 * agrees with `QUOTE_PREVIEW_MAX_CHARS`.
 *
 * ── WHY THERE IS NO THUMBNAIL ─────────────────────────────────────────────────────────────────
 * A quoted image says "Photo" and a quoted run says "Run", from `QUOTE_MEDIA_LABEL`. Phases 6, 8,
 * 12 and 13 all produce such messages, and every one of them can land without touching this file.
 * A 28px thumbnail needs the blob URL, its own sizing decision and a dead-blob fallback, all of
 * which belong to the phase that owns images — and this phase must not touch them. If phase 6
 * wants it later, it adds one optional prop here and this stays as the fallback.
 */
export function QuoteStub({
  quote,
  mine,
  onJump,
  className,
}: {
  quote: QuoteView
  /**
   * Whose bubble the stub is sitting INSIDE — not whose message is quoted. It does not pick the
   * FILL (RULING E1: `bg-ink-3/20` is correct on every ground), only the left rule's colour and
   * the two text colours, because the accent and the body copy do have to know which ground they
   * are on. The composer passes `false`: its ground is `--paper`, the same side of the range as
   * Nina's `--card` bubble.
   */
  mine: boolean
  /** Omitted in the composer, where the target is not on screen to be scrolled to. */
  onJump?: (targetId: string) => void
  className?: string
}) {
  const author = quote.author === 'you' ? 'You' : 'Nina'
  const label = quote.media === 'none' ? author : `${author} · ${QUOTE_MEDIA_LABEL[quote.media]}`

  const body = (
    <>
      <span
        className={cn(
          'block text-[12px] leading-none font-semibold',
          mine ? 'text-card' : 'text-accent',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'mt-1 line-clamp-2 block text-[13px] leading-[1.35] font-medium break-words',
          mine ? 'text-card/85' : 'text-ink-2',
        )}
      >
        {quote.preview}
      </span>
    </>
  )

  const skin = cn(
    'w-full rounded-field border-l-2 bg-ink-3/20 px-3 py-2 text-left',
    mine ? 'border-card/40' : 'border-accent',
    className,
  )

  if (onJump === undefined) return <div className={skin}>{body}</div>

  return (
    <button
      type="button"
      onClick={() => onJump(quote.targetId)}
      aria-label={`Go to the message from ${author}: ${quote.preview}`}
      className={cn(
        skin,
        /* The pressed state deepens the same alpha rather than switching token, for the same
         * reason the fill does not branch: one class, correct on every ground. */
        'min-h-11 transition-colors active:bg-ink-3/35',
        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
      )}
    >
      {body}
    </button>
  )
}
