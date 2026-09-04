'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'

import { cn } from '@/lib/cn'
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
 * ── WHAT IT DOES NOT DO ───────────────────────────────────────────────────────────────────────
 * It never creates a second empty session: `createNinaChatSession` returns the newest session
 * unchanged when that one holds no messages, so a runner who taps twice gets one empty row. Nothing
 * is re-decided here.
 */
export function NewChatButton({
  onNavigate,
  className,
}: {
  /** Close the sidebar when the action refuses and there is nothing to navigate to. */
  onNavigate: () => void
  className?: string
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
      disabled={pending}
      className={cn(
        'flex h-11 w-full items-center justify-center gap-2 rounded-field bg-ink px-4',
        'text-[14px] font-semibold text-card transition-opacity active:opacity-80',
        'disabled:opacity-60',
        className,
      )}
    >
      <span aria-hidden="true" className="text-[17px] leading-none">
        +
      </span>
      <span>{pending ? 'Membuka chat baru…' : 'Chat baru'}</span>
    </button>
  )
}
