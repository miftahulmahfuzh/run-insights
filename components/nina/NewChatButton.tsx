'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'

import { cn } from '@/lib/cn'
import { NINA_CHROME_CONTROL_CLASS } from '@/lib/nina/chrome'
import { createNinaChatSession } from '@/lib/nina/sessionActions'

/**
 * **R2's create control — "users should be able to create a new chat session".**
 *
 * ── WHY THIS LIVES IN PHASE 6 ─────────────────────────────────────────────────────────────────
 * It is a recorded scope addition, not a phase that wandered. Phase 3 shipped
 * `createNinaChatSession` and no call site; phase 5 left `app/nina/page.tsx`'s header untouched, so
 * it had nothing to relocate into the sidebar and left `newChatSlot` as a documented seam
 * defaulting to `null`. R2's first clause was therefore unsatisfiable on the branch, and this phase
 * is the last one that owns `NinaSidebar.tsx` before the set closes. The alternative — a tenth
 * phase for one button against an action that already exists — buys nothing.
 *
 * ── WHY A `<button>` AND NOT A `<Link>` ───────────────────────────────────────────────────────
 * The session's id does not exist until the action has run, so there is no href to prefetch or
 * long-press. That is the exact case `SessionRow` distinguishes from the row links beside it, and
 * the reason the destination arrives as `next` rather than being spelled here: which URL opens a
 * newly created session is phase 3's rule, decided on the server from an id it minted.
 *
 * ── WHY `replace` AND NOT `push` ──────────────────────────────────────────────────────────────
 * `SessionRow`'s removal argument, and it lands the same way. The entry being replaced is the
 * panel's own pushed `?sidebar=1`; pushing instead would leave a back gesture that returns to an
 * open sidebar sitting over the chat it just opened. Replacing drops the parameter, so the panel
 * closes through the URL that opened it and the gesture underneath still goes back to the session
 * he came from.
 *
 * ── R5: THE ROW BECAME A DISC IN THE RAIL ─────────────────────────────────────────────────────
 * "Chat baru" and "Proses foto" cost two full-width rows on an XS Max, so the sidebar now carries
 * a four-icon rail at its bottom edge (`NinaSidebar.tsx`) and this control is its `+`. The chrome
 * skin is `NINA_CHROME_CONTROL_CLASS` — the chat page's floating pair's own frosted glass, which
 * is the pair the owner pointed at — with `size-11` overriding the pair's `size-8`: the pair's
 * 32 px is a recorded owner exception that does NOT travel (its own docstring: "neither
 * generalises"), because its defence was "the nearest rival target is tens of pixels away", and in
 * the rail the nearest rival is 6 px to the side. 44 px is the floor invariant 4 cites, and two of
 * the rail's four actions (this one creates a session and navigates; the wand navigates) are
 * consequential, not chrome.
 *
 * Pending was a sentence ("Membuka chat baru…") on the row; on a disc it is `aria-busy` plus the
 * dim of `disabled:opacity-60` — `NinaJobActions`' pattern for a one-tap action in flight, and
 * there is no room on a 44 px disc for a sentence anyway.
 *
 * ── WHAT IT DOES NOT DO ───────────────────────────────────────────────────────────────────────
 * It never creates a second empty session: `createNinaChatSession` returns the newest session
 * unchanged when that one holds no messages, so a runner who taps twice gets one empty row. Nothing
 * is re-decided here.
 *
 * It takes no `className` either. The disc's skin is the rail's own policy — `NINA_CHROME_CONTROL_CLASS`
 * at `size-11`, argued in R5 above — and the one caller has never dressed it differently: a prop
 * with no caller is a second way to render a button, waiting (the rule `RunDateLink` applied when
 * its `label` override came back out).
 */
export function NewChatButton({
  onNavigate,
}: {
  /** Close the sidebar when the action refuses and there is nothing to navigate to. */
  onNavigate: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()

  const create = () => {
    startTransition(async () => {
      const outcome = await createNinaChatSession()
      if (!outcome.ok || outcome.next === null) {
        /* The action carries no error sentence — `ok: false` is the whole refusal, `SessionRow`'s
           rule — and a create that failed leaves nothing on screen to explain. Closing returns him
           to the chat he was reading rather than to a control that did nothing visible. */
        onNavigate()
        return
      }
      router.replace(outcome.next)
    })
  }

  return (
    <button
      type="button"
      onClick={create}
      aria-label="Chat baru"
      aria-busy={pending}
      disabled={pending}
      className={cn(NINA_CHROME_CONTROL_CLASS, 'size-11', 'disabled:opacity-60')}
    >
      {/*
        Lucide's `plus` (`M5 12h14`, `M12 5v14`), the glyph AdminNav's collection note covers —
        lucide-static 1.42.0, ISC — drawn at the rail chevrons' own `strokeWidth 2.4` so the disc's
        three house-drawn shapes and this borrowed one read at one weight. `aria-hidden`: the
        button's name is the label above, and a labelled glyph inside a labelled button reads the
        label twice.
      */}
      <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
        <path d="M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M12 5v14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </button>
  )
}
