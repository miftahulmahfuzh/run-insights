'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { ninaImageJobExists } from '@/lib/nina/jobActions'
import { NINA_JOB_GONE_NOTE, ninaJobHref } from '@/lib/nina/jobview'

/**
 * How long the "this job is gone" line stands under the overlay's header. The runner asked for it
 * by number — *"user only got a 2sec one-line notification popup"* — and it happens to be
 * `CopyAdminLinkButton`'s `COPIED_HOLD_MS` exactly, which is the right company to keep: both are
 * transient one-line answers in the same 44 px header row, and two different hold times there
 * would read as two different kinds of message.
 */
const GONE_HOLD_MS = 2000

/** The control's name, exported so the tests assert the string the component renders. */
export const NINA_JOB_DETAIL_LINK_LABEL = 'Buka detail job foto ini'

/**
 * **The full-view overlay's "Buka detail job foto ini" control — and the pre-flight that stops it
 * throwing the runner onto a 404.**
 *
 * ── THE BUG ──────────────────────────────────────────────────────────────────────────────────
 * His words: *"right now, if the job page does not exist, we still redirect it to a 404 page.
 * change it, so if the page does not exist (has been deleted, etc) we do not redirect after
 * pressing the button, user only got a 2sec one-line notification popup"*.
 *
 * The button is minted from `ViewerPhoto.id`, which is the caption bubble's `turn_id` — a fact
 * about the PHOTOGRAPH, written when it arrived and never revisited. The job row beside it can
 * disappear from under it: `/nina/jobs`'s trash icon soft-deletes one (`softDeleteNinaImageJob`),
 * and `app/nina/jobs/[id]/page.tsx` `notFound()`s on a hidden row by design. The photograph stays
 * in the chat, the button stays drawn, and tapping it used to swap a photograph the runner was
 * looking at for a 404 page with only Back to get out of.
 *
 * So the tap asks first (`ninaImageJobExists`, which runs `app/nina/jobs/[id]/page.tsx`'s own four
 * predicates) and navigates only on a yes. On a no: nothing moves, the overlay stays open on the
 * photograph, and one line appears under the header for two seconds.
 *
 * ── WHY IT IS STILL AN `<a href>` AND NOT A `<button>` ───────────────────────────────────────
 * The destination is real for the overwhelmingly common case, and an anchor is the only spelling
 * that keeps ⌘-click, middle-click and "Open in new tab" working on it. `NinaJobActions.tsx`'s
 * `openFullView` already establishes the pattern this follows verbatim: bail out of our own
 * handler on `defaultPrevented`, on a non-primary button and on any of the four modifier keys —
 * those clicks belong to the browser, which opens a background tab the runner can read or close
 * without the overlay ever moving. A modified click on a deleted job therefore still lands on the
 * 404, and that is correct: the runner explicitly asked the browser to go there, and silently
 * swallowing a new-tab gesture would be the stranger behaviour. The plain tap — the gesture the
 * bug report is about — is the one this intercepts.
 *
 * ── ONE IN-FLIGHT TAP AT A TIME ──────────────────────────────────────────────────────────────
 * `checking` guards re-entry rather than disabling the anchor: `disabled` is not a thing an `<a>`
 * has, and `aria-disabled` on a link that still navigates is a lie. The round trip is a single
 * indexed read, so this window is milliseconds; it exists so a double-tap cannot fire two actions
 * and two pushes.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────────────────────────
 * **It does not close the viewer itself.** Both call sites disagree about that and both are right:
 * `ChatScreen` closes (its `closeViewer` is plain state — `usePhotoViewer.ts:109`), `/nina/about`
 * must NOT (`close()` there calls `window.history.back()` on the pushed `?photo=` entry, and
 * firing that in the same tick as a push races it — measured in production 2026-09-08, see
 * `NinaAboutScreen.tsx`'s header on this control). So the caller passes `onNavigate`, and it is
 * invoked only on the branch that actually navigates. A refused tap closes nothing: the runner
 * stays on the photograph he was looking at, which is the whole point of the change.
 *
 * **It does not re-check on render, or hide itself.** A pre-flight is a snapshot; a render-time
 * check would be a second snapshot, one round trip per photograph paged past, and it would make
 * the control appear and disappear under the runner's thumb. The button is always there and
 * always answers.
 */
export function NinaJobDetailLink({
  /** The `nina_turns` job id — `ViewerPhoto.id`, straight through from the caller's mapper. */
  jobId,
  /**
   * Run on a SUCCESSFUL navigation only, before the push. `ChatScreen` passes `closeViewer`;
   * `/nina/about` passes nothing — see this component's header for why those differ.
   */
  onNavigate,
}: {
  jobId: string
  onNavigate?: () => void
}) {
  const router = useRouter()
  const [checking, setChecking] = React.useState(false)
  const [gone, setGone] = React.useState(false)

  /* The line's own clock. Keyed on `gone` so a second refused tap inside the window restarts the
   * two seconds rather than letting the first tap's timer cut the second one short. */
  React.useEffect(() => {
    if (!gone) return
    const timer = window.setTimeout(() => setGone(false), GONE_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [gone])

  function onClick(event: React.MouseEvent<HTMLAnchorElement>) {
    /* `NinaJobActions.tsx`'s `openFullView`, verbatim: something else already decided, or this
     * click is the browser's to handle (new tab, new window, download). Hands off. */
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

    event.preventDefault()
    if (checking) return

    setChecking(true)
    setGone(false)
    void ninaImageJobExists({ jobId })
      .then((outcome) => {
        if (!outcome.exists) {
          setGone(true)
          return
        }
        onNavigate?.()
        router.push(ninaJobHref(jobId))
      })
      .catch(() => {
        /* The action threw — offline, or a server error. The runner gets the same line rather than
         * a navigation into the unknown: "I could not open it" is what both cases mean to him, and
         * pushing anyway would be guessing on his behalf in the direction the bug report asked us
         * to stop guessing in. */
        setGone(true)
      })
      .finally(() => setChecking(false))
  }

  return (
    <>
      <Link
        href={ninaJobHref(jobId)}
        onClick={onClick}
        aria-busy={checking}
        aria-label={NINA_JOB_DETAIL_LINK_LABEL}
        title={NINA_JOB_DETAIL_LINK_LABEL}
        className="grid size-11 place-items-center rounded-pill text-card"
      >
        <JobDetailIcon className="size-5" />
      </Link>

      {/*
        The popup. Geometry is `CopyAdminLinkButton`'s manual-fallback box, deliberately identical —
        same inset, same offset under `PhotoViewer`'s header, same `z-70` over the `z-60` overlay —
        because these are the two transient messages this header row can produce and they should
        appear in the same place. `4.25rem + var(--safe-top)` is that header's own arithmetic
        (`pt-[calc(0.75rem+var(--safe-top))] pb-3` around a `size-11` control: 0.75 + 2.75 + 0.75);
        Tailwind cannot read a constant, so changing the header's padding means changing both
        literals. `fixed` and not `absolute`: this renders inside the header's `flex shrink-0`
        cluster, where a laid-out box would squeeze the ✕ off the edge.

        The two can collide only if a clipboard write fails and a job is tapped within the same two
        seconds — a pair of rare cases on one photograph, left alone rather than paid for with a
        shared notice channel threaded through two screens.

        `role="status"` with `aria-live="polite"`: announced without stealing focus from the control
        the runner's finger is still on. One line, no button, no dismiss — it is gone in 2 s, and a
        dismiss affordance on a two-second message is a target nobody can hit.
      */}
      {gone && (
        <span
          role="status"
          aria-live="polite"
          className="fixed inset-x-3 top-[calc(4.25rem+var(--safe-top))] z-70 block truncate rounded-field bg-card px-2.5 py-2 text-[11px] font-medium text-ink-3"
        >
          {NINA_JOB_GONE_NOTE}
        </span>
      )}
    </>
  )
}

/**
 * "Buka detail job foto ini". Lucide's `receipt-text`, verbatim — the job detail page is literally
 * her "Catatan foto" (photo notes) card.
 *
 * This used to be copied character-for-character into `ChatScreen.tsx` and `NinaAboutScreen.tsx`,
 * with the second copy's docstring saying so out loud. Both call sites now render this component
 * instead, so there is one glyph again — and, more to the point, one place where the rule about
 * what a tap does lives.
 *
 * `strokeWidth` 2 and a caller-supplied `size-5`, matching `CopyAdminLinkButton`'s marks and the ✕
 * beside them, so the header row stays visually even. `aria-hidden`: the link already carries the
 * accessible name.
 */
function JobDetailIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </svg>
  )
}
