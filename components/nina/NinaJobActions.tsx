'use client'

import * as React from 'react'

import { redoNinaImageJob, type NinaJobActionResult } from '@/lib/nina/jobActions'
import { ninaJobTitle, type NinaJobListItem, type NinaJobRefusal } from '@/lib/nina/jobview'

/**
 * **R1's redo control — one tap, no dialog — and the slot phase 2 puts its delete button in.**
 *
 * ── ONE TAP, AND THE PRECEDENT IT OVERRIDES ON PURPOSE ────────────────────────────────────────
 * `components/nina/SessionRow.tsx` guards its remove behind `⋯` → Hapus → Hapus chat, and its
 * header explains why at length: that control hard-deletes a conversation and, through two
 * cascades, its photographs — permanently, with no undo. **None of that transfers here**, and the
 * user said so first: *"we dont need confirmation message to execute them"*. A redo opens one row
 * and spends one of six generations a day, and what it produces is a photograph he asked for. So:
 * no menu, no panel, no second tap, and no `window.confirm` — which `RetryExtraction` already
 * refuses on iOS grounds anyway ("a system dialog that reads as an error").
 *
 * The mis-tap protection that IS here is the one that costs nothing: `disabled={pending}`, so a
 * double-tap cannot open two jobs. After the list refreshes he can tap again, and that is a second
 * deliberate act rather than a bug — the cap is what bounds it, on the server.
 *
 * ── WHY IT IS A SIBLING OF THE ROW'S LINK AND NOT A CHILD ─────────────────────────────────────
 * A `<button>` inside an `<a>` is invalid HTML and breaks the link's hit testing —
 * `SessionRow`'s recorded rule, one list over. So `NinaJobList` makes the row a flex line and this
 * component is the second item in it. It renders a FRAGMENT of two flex children, not one wrapper:
 * the icon cluster, which sits on the row's own line, and the refusal note, which carries `w-full`
 * so the parent's `flex-wrap` drops it onto a line of its own underneath. A sentence squeezed into
 * a 44px column would be unreadable, and an absolutely-positioned one would need a z-index over
 * rows this component does not own.
 *
 * ── THE ICON IS HAND-WRITTEN SVG ──────────────────────────────────────────────────────────────
 * `SessionRow`'s `PinIcon` and `TabBar`'s glyphs, for `TabBar`'s stated reason — "four glyphs is
 * not worth a package, and an icon font would be a second webfont on a page whose first is already
 * Poppins". `aria-hidden` on the path, because the accessible name belongs on the button.
 *
 * ── THE ACCESSIBLE NAME NAMES THE ROW ─────────────────────────────────────────────────────────
 * `Coba lagi sore di kos`, not `Coba lagi`. Six rows of "Coba lagi" is a list a screen reader
 * cannot navigate. `ninaJobTitle` is the same pure function `NinaJobList` renders as the visible
 * title, so the two are one string and cannot drift.
 *
 * ── THE SERVER OWNS THE REFUSAL; THIS FILE OWNS THE WORDS ─────────────────────────────────────
 * `NinaJobActionResult` is `{ ok, reason }` and carries no prose — `SessionRow` renders its own
 * sentence for exactly this reason, and `FolderMenu`'s rule is the one both obey: "there is
 * exactly one place a rule lives and no chance of a control that permits what the action refuses".
 * What differs from `SessionRow` is one field: `reason` is a discriminant, so `capped` can say the
 * thing a runner actually needs to hear rather than a generic "tidak bisa".
 *
 * ── WHAT PHASE 2 APPENDS, AND WHERE ───────────────────────────────────────────────────────────
 * A second `<button>` inside the SAME `<span>` cluster below, calling `run(() =>
 * deleteNinaImageJob({ jobId: item.id }))`. It needs nothing else: `run()` already owns the
 * pending flag and the note for both controls, `NOTE` is already keyed by the whole
 * `NinaJobRefusal` union, and the cluster is already a flex container. Nothing in this file has to
 * be restructured for it.
 */

/**
 * Every refusal, in his language. A `Record` over the whole union so `tsc` fails the day a fifth
 * refusal appears without a sentence — the property `NINA_JOB_JUMP_NOTE` has one module over.
 *
 * Phase 2's delete reuses `not-found` verbatim: "the row is not there any more" is the same fact
 * whichever button asked.
 */
const NOTE: Record<NinaJobRefusal, string> = {
  'not-found': 'Job ini sudah nggak ada.',
  'not-failed': 'Cuma job yang gagal yang bisa diulang.',
  'no-args': 'Job lama ini nggak nyimpan prompt-nya, jadi nggak bisa diulang.',
  capped: 'Jatah foto hari ini sudah habis. Coba lagi besok ya.',
}

export function NinaJobActions({ item }: { item: NinaJobListItem }) {
  const [note, setNote] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  /**
   * Every control's submit, so the pending flag and the note cannot get out of step —
   * `SessionRow`'s `run()`, same reason and same shape. Phase 2's delete button calls this too.
   *
   * A success clears the note and does nothing else: `revalidatePath` on the server has already
   * re-rendered the list this control is standing in, so there is no navigation to perform and no
   * local state to reconcile.
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
        {item.canRedo && (
          <button
            type="button"
            aria-label={`Coba lagi ${title}`}
            aria-busy={pending}
            disabled={pending}
            onClick={() => run(() => redoNinaImageJob({ jobId: item.id }))}
            className="grid size-11 shrink-0 place-items-center rounded-pill text-ink-3 disabled:opacity-40"
          >
            <RedoIcon />
          </button>
        )}
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

/**
 * A clockwise arrow that does not quite close, with a head at the top right — the shape every
 * "run it again" control has worn since a refresh button was a thing. 18px, `currentColor`, so the
 * button's `text-ink-3` and its `disabled:opacity-40` are the only styling it needs.
 *
 * `aria-hidden`, because the button already carries the name. `PinIcon`'s arrangement exactly.
 */
function RedoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" aria-hidden="true">
      <path
        d="M20 12a8 8 0 1 1-2.34-5.66"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M20 4v5h-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
