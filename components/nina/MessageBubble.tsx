import type * as React from 'react'

import { cn } from '@/lib/cn'
import type { ChatMessage } from './types'

/**
 * One message. Two sides, one extension slot, no client JavaScript.
 *
 * Not marked `'use client'` **at this phase's landing**, for the reason `Button` and `Chip` are
 * not: nothing here uses a hook, so the module compiles into whichever graph imports it. Today
 * that is only `MessageList`.
 *
 * **Phase 7 adds `'use client'` to this file, and that is checked and fine (RULING E8).** It owns
 * a touch gesture on the quote stub, which needs a hook, so the directive is unavoidable there.
 * Nobody downstream loses anything: phase 6 does not edit this file and reaches it through
 * `MessageList`; phase 8 fills `above` from `MessageList`; phase 11 states explicitly that it does
 * not touch this file; and phase 13 needs no server-rendered bubble, because attaching an album
 * photo writes a real row and the page navigates to `/nina`, where this renderer draws it. So no
 * `BubbleShell` split is needed — and the directive is recorded here rather than discovered by
 * watching a build fail.
 *
 * ── WHY THESE TWO FILLS AND NOT A COLOURED ONE ────────────────────────────────────────────────
 * Hers is `bg-card` + `shadow-card` at `rounded-card`, which is the app's *only* surface — "White
 * fill, 22px radius, soft shadow, no border" (`components/ui/Card.tsx`). An incoming message is a
 * card floating on sky paper, and the design system already had the answer.
 *
 * His is `bg-ink text-card`, which is the one saturated fill this system endorses: `Chip` calls it
 * "a solid ink slab" and pairs it with the tint of the page "so a chip and a button never disagree
 * about what 'chosen' looks like". Here it means "mine". It also inverts correctly — in dark mode
 * `--ink` is near-white and `--card` is near-navy, so the two sides stay opposites in both schemes.
 *
 * `--accent` is **not** available for this. `Button`'s docstring records the measurement: white on
 * the cyan accent lands near 2:1, well under WCAG's 4.5:1, and "the accent earns its keep on labels
 * and links, where it sits on paper". `--z5` coral is spoken for by the Upload FAB, and `--warn` /
 * `--red` are the attention language and "never decoration" (`docs/design/tokens.css`).
 *
 * ── THE TAIL IS A RADIUS, NOT A TRIANGLE ──────────────────────────────────────────────────────
 * One corner drops from `rounded-card` (22px) to `rounded-chip` (8px) on the side the message came
 * from. That reads as a WhatsApp tail using two radii the system already publishes, and it needs no
 * pseudo-element, no rotated square and no border — which matters, because "no borders on surfaces"
 * is a hard rule and a drawn tail is the classic way people break it.
 *
 * ── 15px, WHERE THE APP'S BODY TEXT IS 13 ─────────────────────────────────────────────────────
 * A deliberate step up, and the only place in the app that takes it for prose. `InsightCard`'s 13px
 * body sits *below* a 19px headline that carries the screen; a chat bubble has nothing above it, so
 * the bubble text IS the screen's content. 15px is an existing step in the scale (it is `Button`'s
 * label size), not a new one, and `leading-[1.5]` keeps the block readable at that size.
 *
 * ── NO ENTRANCE ANIMATION ─────────────────────────────────────────────────────────────────────
 * A bubble appears. It does not slide, fade or scale in. This app has exactly one keyframe and a
 * global reduced-motion escape that redefines it to hold still; a second keyframe for decoration
 * would be the first in the codebase and would have to argue against that file's own conclusion
 * that "the pulse was decoration over a signal that does not need it". The stagger from
 * `lib/nina/reveal.ts` is the only timing on this screen, and it carries real information — that
 * these are four separate things she said.
 *
 * ── PLAIN TEXT, ON PURPOSE ────────────────────────────────────────────────────────────────────
 * `whitespace-pre-wrap` so her line breaks survive, `break-words` so a pasted URL cannot widen the
 * column. No markdown renderer and no `dangerouslySetInnerHTML`: there is no markdown anywhere in
 * this app, and adding one here would be inventing a capability rather than shipping a screen.
 * iOS auto-linking of times and dates is already off app-wide (`app/layout.tsx`'s
 * `formatDetection`), which is what stops "jam 7" turning into a phone number in a bubble.
 */
export function MessageBubble({
  message,
  above,
}: {
  message: ChatMessage
  /**
   * Rendered inside the bubble, above the text. **The seam for phases 6 and 8** — the images (6)
   * and the attached-run card (8) hang here, composed by `MessageList`. The reply quote does
   * **not**: phase 7 gives it its own `quote` prop on this component so the two never compete for
   * one slot, and renders `quote` above `above` (RULING E2). Render order, top to bottom:
   * quote stub → images → run card → text.
   *
   * The pattern to follow is `InsightCard`'s nested block, with one substitution:
   * `rounded-field bg-ink-3/20 p-3.5`, **not** `bg-paper-2`. `bg-paper-2` is near-white in light
   * mode and near-navy in dark, so inside a `bg-ink` bubble it inverts and reads as a hole in one
   * scheme. `--ink-3` is `#93a2b0` in light and `#7c8d9b` in dark (`app/globals.css`) — a
   * mid-grey in both — so one class works on both sides with no per-side branch and no variant
   * plumbing (RULING E1). Phase 4 never passes this prop.
   */
  above?: React.ReactNode
}) {
  const mine = message.role === 'user'

  return (
    <li
      /*
       * A stable DOM id per message. Phase 7 needs exactly this to scroll a tapped quote to its
       * target; it costs one attribute now and would cost a re-read of every row later.
       */
      id={`nina-msg-${message.id}`}
      data-role={message.role}
      className={cn('flex', mine ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[85%] px-4 py-2.5 text-[15px] leading-[1.5] font-medium break-words whitespace-pre-wrap',
          mine
            ? 'rounded-card rounded-br-chip bg-ink text-card'
            : 'rounded-card rounded-bl-chip bg-card text-ink shadow-card',
          // Two quiet states, both of which leave the text readable. An optimistic row is dimmed
          // while it is unconfirmed; a row whose send threw keeps a red hairline so the runner can
          // see which line to try again, without an icon, a badge or a retry button.
          message.state === 'sending' && 'opacity-60',
          message.state === 'failed' && 'ring-1 ring-red',
        )}
      >
        {above}
        {message.body}
      </div>
    </li>
  )
}
