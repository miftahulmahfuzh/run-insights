'use client'

import Link from 'next/link'
import * as React from 'react'

import { deleteNinaImageJob, type NinaJobActionResult } from '@/lib/nina/jobActions'
import { ninaJobTitle, type NinaJobListItem, type NinaJobRefusal } from '@/lib/nina/jobview'

/**
 * **R2's row controls: the full-view link to the job's generated photograph, and the delete
 * button beside it.**
 *
 * ── WHY THE FULL-VIEW LINK REPLACED R1's REDO BUTTON ──────────────────────────────────────────
 * R1 shipped a one-tap redo here first ("clicking this will redo the failed job"). In practice a
 * redo the runner cannot see the result of from this screen was not a control worth the tap: he
 * still has to open the row to find out what changed. The row already carries everything
 * `planJobPhoto` needs to jump straight to the same full-screen viewer the detail page opens, so
 * R2 swapped the verb — one tap now shows the photograph instead of re-running the job. Redo did
 * not disappear: it is still `/nina/jobs/[id]`'s own retry button, gated by `jobCanRedo` there.
 *
 * ── WHY IT IS A LINK, NOT A BUTTON, AND CARRIES NO `pending` ──────────────────────────────────
 * It navigates; it mutates nothing. `deleteNinaImageJob` is the only action left in this
 * component, so `pending`/`note` below exist for that control alone — a second, unrelated
 * navigation control does not need to freeze while a delete is in flight.
 *
 * ── WHY IT IS A SIBLING OF THE ROW'S LINK AND NOT A CHILD ─────────────────────────────────────
 * A nested `<a>` breaks the outer link's hit testing — `SessionRow`'s recorded rule, one list
 * over. `NinaJobList` makes the row a flex line and this component is the second item in it: a
 * fragment of flex children, not one wrapper — the icon cluster, on the row's own line, and the
 * refusal note, which carries `w-full` so the parent's `flex-wrap` drops it onto its own line
 * underneath.
 *
 * ── THE ICONS ARE HAND-WRITTEN SVG ────────────────────────────────────────────────────────────
 * `SessionRow`'s `PinIcon` and `TabBar`'s glyphs, for `TabBar`'s stated reason — "four glyphs is
 * not worth a package, and an icon font would be a second webfont on a page whose first is
 * already Poppins". `aria-hidden` on the path, because the accessible name belongs on the link
 * or button.
 *
 * ── THE ACCESSIBLE NAME NAMES THE ROW ─────────────────────────────────────────────────────────
 * `Lihat foto ukuran penuh sore di kos`, not `Lihat foto ukuran penuh`. Six rows of the same
 * generic name is a list a screen reader cannot navigate. `ninaJobTitle` is the same pure
 * function `NinaJobList` renders as the visible title, so the two are one string and cannot
 * drift.
 *
 * ── THE SERVER OWNS THE REFUSAL; THIS FILE OWNS THE WORDS ─────────────────────────────────────
 * `NinaJobActionResult` is `{ ok, reason }` and carries no prose — `SessionRow`'s header records
 * why ("there is exactly one place a rule lives and no chance of a control that permits what the
 * action refuses"). `NOTE` below only has one caller left in this file (delete), but stays
 * exported: `NinaJobDetail.tsx`'s own retry button renders the identical Indonesian sentence for
 * the redo refusals it still needs, rather than a second copy that can drift.
 */
export const NOTE: Record<NinaJobRefusal, string> = {
  'not-found': 'Job ini sudah nggak ada.',
  'in-progress': 'Job ini masih jalan, tungguin dulu ya.',
  'no-args': 'Job lama ini nggak nyimpan prompt-nya, jadi nggak bisa diulang.',
  capped: 'Jatah foto hari ini sudah habis. Coba lagi besok ya.',
}

export function NinaJobActions({ item }: { item: NinaJobListItem }) {
  const [note, setNote] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  /**
   * The delete button's submit. `SessionRow`'s `run()`, same shape, one caller now instead of two:
   * a success clears the note and does nothing else, because `revalidatePath` on the server has
   * already re-rendered the list this control is standing in.
   */
  function run(action: () => Promise<NinaJobActionResult>) {
    setNote(null)
    startTransition(async () => {
      const outcome = await action()
      if (!outcome.ok) {
        /* `reason` is null only when `ok` is true, so the fallback is unreachable — it is here
         * because a control that says nothing when the server refuses is worse than one that says
         * the wrong thing, and `tsc` cannot narrow a boolean-plus-nullable pair. */
        setNote(NOTE[outcome.reason ?? 'not-found'])
      }
    })
  }

  const title = ninaJobTitle(item)

  return (
    <>
      <span className="flex shrink-0 items-center gap-0.5">
        {item.photo.kind === 'ready' && (
          <Link
            href={item.photo.href}
            aria-label={`Lihat foto ukuran penuh ${title}`}
            className="grid size-11 shrink-0 place-items-center rounded-pill text-ink-3"
          >
            <Maximize2Icon />
          </Link>
        )}
        {/*
          R2's control, and it renders on EVERY row — a done job, a queued job and a failed job all
          get it, because "so i can keep the job list tidy and pristine" is about the whole list.
          The full-view link above is gated on `item.photo.kind === 'ready'` instead — a job whose
          photograph has not landed yet has nothing to show.

          A SIBLING of the row's <Link>, never a child: `SessionRow` records the rule ("a <button>
          inside an <a> is invalid and breaks the link's hit testing"), and this row's slot is
          where that separation already lives.

          `size-11` is 44px — `Button.tsx`'s `md`, "the iOS minimum tap target, never less" —
          which matters more here than anywhere else on the screen: this is a one-tap mutation
          sitting in a vertically-scrolling list, so the target has to be big enough that a scroll
          never ends on it by accident.

          No `window.confirm`, no panel, no second tap. His own words: *"we dont need confirmation
          message to execute them"*.
        */}
        <button
          type="button"
          aria-label={`Hapus ${title} dari daftar`}
          aria-busy={pending}
          disabled={pending}
          onClick={() => run(() => deleteNinaImageJob({ jobId: item.id }))}
          className="grid size-11 shrink-0 place-items-center rounded-pill text-ink-3 transition-colors hover:text-red disabled:opacity-40"
        >
          <TrashIcon />
        </button>
      </span>

      {note !== null && (
        /* `w-full` inside the row's `flex-wrap` is what puts this on its own line under the row.
           `role="status"` so the refusal is announced without stealing focus from the button the
           runner's finger is still on. */
        <span
          role="status"
          className="w-full px-3 pb-2 text-[12px] leading-[1.45] font-semibold text-red"
        >
          {note}
        </span>
      )}
    </>
  )
}

/** "Lihat foto ukuran penuh" — the job's photograph in the full-screen viewer. Lucide's
 * `maximize-2`, verbatim — `NinaJobDetail.tsx`'s own copy of the same glyph, a different screen.
 * `aria-hidden`, because the link already carries the accessible name. */
function Maximize2Icon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 3h6v6" />
      <path d="m21 3-7 7" />
      <path d="m3 21 7-7" />
      <path d="M9 21H3v-6" />
    </svg>
  )
}

/**
 * A trash can at 18px. Hand-written SVG for `SessionRow`'s `PinIcon` reason, quoted from `TabBar`:
 * *"four glyphs is not worth a package, and an icon font would be a second webfont on a page whose
 * first is already Poppins."* `aria-hidden`, because the button above already carries the
 * accessible name and a labelled glyph inside a labelled button reads the label twice.
 *
 * `currentColor` throughout, so the button's own `text-ink-3` → `hover:text-red` is the only place
 * the colour is decided.
 */
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" aria-hidden="true">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 7.5 7.2 18a2 2 0 0 0 2 1.9h5.6a2 2 0 0 0 2-1.9L17.5 7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.5 11v5M13.5 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
