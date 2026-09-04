'use client'

import Link from 'next/link'

import type { RunAttachment } from '@/lib/nina/attach'
import { useChatScrollMark } from './useChatScroll'

/**
 * A run, inside the bubble that attached it (R13), and the door to it (R14).
 *
 * ── THE INSET SURFACE IS `bg-ink-3/20` (RULING E1), AND WHY THAT ANSWERS PHASE 4'S FLAG ───────
 * `MessageBubble`'s docstring warns that the pattern for a nested block — "`rounded-field
 * bg-paper-2 p-3.5`" — inverts wrongly on his `bg-ink` bubble, and hands the problem here. The
 * answer is `bg-ink-3/20`, and it is *verified* rather than argued: `app/globals.css` sets
 * `--ink-3: #93a2b0` in light and `#7c8d9b` in dark, so the token is a mid-grey in **both**
 * schemes. One class therefore reads correctly on both sides of the bubble — a soft grey veil over
 * `--card` on hers and over `--ink` on his — with no branch on `role`, no `data-[role=…]` variant
 * plumbing and no new token. Four phases need this same inset (6, 7, 8 and 13), so it is one
 * shared class or it is four slightly different ones.
 *
 * The runner-up was deriving the veil from the bubble's own text colour — `bg-current/10`, which
 * is 10% of `--card` on his ink bubble and 10% of `--ink` on hers, in both schemes, with contrast
 * guaranteed because the text inherits `currentColor`. It loses on the ground this phase itself
 * named: arbitrary-opacity support on `bg-current` is **unverified** in this Tailwind setup, and
 * an unverified mechanism must not be the shared answer for four phases. `ink-3/20` buys the same
 * "correct on both sides" guarantee by a route that can be read off a file.
 *
 * No border and no shadow: "no borders on surfaces" is a hard rule, and a shadow inside a bubble
 * that already has one reads as a mistake.
 *
 * ── WHY THE MARK IS SAVED IN `onNavigate` ─────────────────────────────────────────────────────
 * `onNavigate` is Link's navigation-lifecycle hook, so it fires on a real navigation and not on a
 * modified click the browser is going to handle itself — a middle-click or a cmd-click opens a new
 * tab, leaves this history entry alone, and must not rewrite its URL. `onClick` would fire for
 * those too.
 *
 * ── ONE `<Link>`, PREFETCHED LIKE ANY OTHER ───────────────────────────────────────────────────
 * `/r/[id]` is a dynamic route with no `loading.tsx`, so prefetching is skipped and there is
 * nothing to turn off here and nothing to tune. The run page's own two indexed reads are what make
 * the tap feel immediate, and they already do on every other link into it.
 */
export function RunAttachmentCard({ attachment }: { attachment: RunAttachment }) {
  const { saveMark } = useChatScrollMark()

  return (
    <Link
      href={`/r/${attachment.runId}`}
      onNavigate={saveMark}
      className="mb-2 block rounded-field bg-ink-3/20 p-3"
    >
      <span className="block text-[11px] font-semibold tracking-[0.04em] uppercase opacity-70">
        {[attachment.day, attachment.location].filter(Boolean).join(' · ')}
      </span>
      <span className="mt-1 block text-[15px] font-bold">{attachment.distance}</span>
      <span className="mt-0.5 block text-[12px] font-medium opacity-70">
        {[attachment.duration, attachment.pace].join(' · ')}
      </span>
    </Link>
  )
}
