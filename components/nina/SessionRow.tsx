'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'

import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import {
  removeNinaChatSession,
  renameNinaChatSession,
  setNinaChatSessionPinned,
  type NinaSessionActionResult,
} from '@/lib/nina/sessionActions'
import { NINA_SESSION_TITLE_MAX_CHARS } from '@/lib/nina/sessions'
import { planSessionRemoval, type SidebarSession } from '@/lib/nina/sidebar'

/**
 * One chat in the sidebar, with its three secondary actions — F35 R4 (pin), R3's manual half
 * (rename) and R11 (remove).
 *
 * ── THE AFFORDANCE IS A `⋯` DISCLOSURE, AND THREE ALTERNATIVES ARE ON THE RECORD ──────────────
 * The row's primary action is "open this chat". Three secondary actions have to fit beside it on a
 * phone-width, vertically-scrolling list without a scroll ever firing one.
 *
 *   - **Not a swipe.** `decideReplySwipe` is the precedent for building a gesture honestly and
 *     also the precedent for not building one here: its fourth rule exists because the gesture
 *     "must not eat the chat log's vertical scroll", and a denser list is a worse place for that
 *     competition. It affords one action, not three. And R11 is irreversible — a trigger whose
 *     failure mode is being mistaken for a scroll is the worst available one for a permanent
 *     delete.
 *   - **Not a long-press.** On the record in `MessageBubble`: it "collides with iOS text selection
 *     and the native callout menu on a block of selectable prose". A chat title is selectable
 *     prose too.
 *   - **Not a tap on the row.** The row's tap is the navigation, and making the row a button
 *     "breaks text selection just as thoroughly".
 *
 * So: a 44px `⋯` button, a SIBLING of the row's link and not a child (a `<button>` inside an `<a>`
 * is invalid and breaks the link's hit testing). `components/admin/FolderMenu.tsx` is the shape —
 * a `mode` union, one panel per mode, one `run()` that
 * owns the pending flag and the error line, and a Cancel that just resets `mode`.
 *
 * The PIN STATE is on the row; the PIN CONTROL is in the menu. A tappable pin glyph would put a
 * one-tap mutation back into the scroll path to save a tap on the action performed least often.
 *
 * ── THE PANELS EXPAND INLINE, WHICH IS WHERE THIS DIVERGES FROM `FolderMenu` ───────────────────
 * `FolderMenu`'s panels are `absolute` because its trigger "renders inline in `FolderTree`'s `Row`,
 * which is a 200px flex line". This sidebar is the full width of the phone and scrolls vertically;
 * an absolute panel would be clipped by the panel's own `overflow-y-auto` and would need a z-index
 * over rows it does not own. Inline expansion needs neither.
 *
 * ── THE SERVER OWNS EVERY REFUSAL ─────────────────────────────────────────────────────────────
 * `FolderMenu`'s rule, quoted: nothing here pre-validates a title, so "there is exactly one place
 * a rule lives and no chance of a control that permits what the action refuses (or, worse, forbids
 * what it would have allowed)". Phase 4 owns the rename validation rule; this row renders its own
 * sentence when the action refuses, because `NinaSessionActionResult` carries `{ ok, next }` and no
 * error prose. The ONE thing borrowed is the cap, as `NINA_SESSION_TITLE_MAX_CHARS` — the
 * arrangement `lib/nina/albumActions.ts` argues for with `NINA_ATTACH_MAX_CHARS`, so the input's
 * `maxLength` and the server's clamp are one number.
 *
 * ── R11 DELETES ON THE TAP, AND THE CONFIRMATION PANEL THAT WAS HERE IS GONE ──────────────────
 * `⋯` → Hapus, and the removal fires. There is no second panel: task #136 took it out, on the
 * instruction this codebase already carried for the same class of control — *"we dont need
 * confirmation message to execute them"*, recorded in `components/nina/NinaJobActions.tsx` and
 * `lib/nina/jobActions.ts`. This file used to be the precedent that instruction overrode; the
 * set is now one shape.
 *
 * **What that did NOT change is the stake — and R1 has since narrowed it.** Removing a chat is
 * still a hard delete of the session and its messages, with no archive flag and therefore no undo
 * — unlike `nina_turns.deleted_at`, where a mis-tap is one `update … set deleted_at = null` away
 * from being reversed. The PHOTOGRAPHS are no longer part of that loss:
 * `nina_message_images.message_id` is `ON DELETE SET NULL` since R1, so they outlive the
 * conversation and stay in the Chat photos collection. So the asymmetry between this control and
 * the job list's is real and stays on the record; what changed is the judgement about what is
 * worth spending on it, and it is the runner's own chats he made that call about.
 *
 * **R1 also put a sentence in the panel saying the photographs survive, and that sentence went out
 * with the panel.** None of the GUARANTEE went with it — that lives in the foreign key, which is
 * where R1 deliberately put it (*"`removeNinaSession` did not change to get this — the FK did"*).
 * What is gone is the reassurance at the moment of the tap, which is the price of the panel going;
 * `/admin/photos` is where the photographs are still found.
 *
 * What guards it now — all of it cheap, none of it a second screen:
 *
 *   1. **Two deliberate taps, not one.** The menu is still behind `⋯`, so the row's own tap is
 *      still the navigation and no stray tap on a scrolling list can delete anything. The two
 *      targets sit at different positions, so a double-tap on the disclosure cannot reach
 *      "Hapus" either.
 *   2. **`loading={pending}` on the destructive button**, which `Button.tsx` turns into
 *      `disabled` — so a second tap inside the round trip cannot fire a second removal.
 *      `NinaJobActions` calls this "the mis-tap protection that IS here … the one that costs
 *      nothing", and for a one-tap mutation it is the whole of it.
 *   3. **44px targets** (`Button`'s `md`), which the same file calls "the safeguard the
 *      confirmation dialog would have been, spent on the input instead of on a second screen".
 *   4. **No `window.confirm`**, for `RetryExtraction`'s recorded reason: on iOS it is "a system
 *      dialog that reads as an error". Nothing in #136 reopens that.
 *
 * An UNDO is the honest replacement for a confirmation, and it is a feature rather than a
 * drive-by: it needs somewhere to put the row, which means giving `nina_chat_sessions` what
 * `nina_turns` already has — a nullable flag, every reader filtering on it, and a trash view to
 * reach the flagged ones from. #136 put that out of scope, and a client-side "undo" over a row
 * already gone from Postgres would be a lie rather than a cheap version of one.
 *
 * One consequence to keep straight: a REFUSED removal leaves the **menu** open with the sentence
 * in it, which is why the error line lives in the menu block. `run()`'s rule is that a refusal
 * keeps the panel it was fired from, and after #136 that panel is the menu.
 *
 * ── THE ACTIVE ROW IS A BUTTON, NOT A LINK ────────────────────────────────────────────────────
 * Navigating to the chat you are already reading costs a server round trip and a history entry to
 * change nothing. Closing the panel is what that tap means. So the element type is conditional,
 * and the open row also says the word "Open" — furniture, and worth it: the panel is opaque and
 * full-screen, so the runner cannot see the conversation a highlight would be pointing at.
 */
type RowMode = 'idle' | 'menu' | 'rename'

export function SessionRow({
  session,
  active,
  activeSessionId,
  onClose,
}: {
  session: SidebarSession
  active: boolean
  /* Phase 3's `removeNinaChatSession` takes `{ sessionId, activeSessionId }` and returns `next`, so
   * the destination after a removal is decided once, on the server, from ids it has proved
   * ownership of. This row reports which session its URL is showing; it does not decide where to
   * go. */
  activeSessionId: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const [mode, setMode] = React.useState<RowMode>('idle')
  const [draft, setDraft] = React.useState(session.title)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  /**
   * Every panel's submit, so the pending flag, the error line and the mode reset cannot get out of
   * step — `FolderMenu`'s `run()`, same reason. A refusal leaves the panel OPEN with the sentence
   * in it: closing it would throw away the only explanation the runner is going to get.
   */
  function run(
    action: () => Promise<NinaSessionActionResult>,
    onOk: (result: NinaSessionActionResult) => void,
  ) {
    setError(null)
    startTransition(async () => {
      const outcome = await action()
      if (!outcome.ok) {
        /* Phase 3's `NinaSessionActionResult` is `{ ok, next }` — it carries NO `error` sentence.
         * `ok: false` is the whole refusal, so the sentence is this row's, in one place, in his
         * language. Phase 4 still owns the RULE that produces the refusal
         * (`sanitizeNinaSessionTitle` — empty, invisible-only, or over the cap); what differs is
         * that the row supplies the words rather than rendering the server's. */
        setError('Tidak bisa. Coba nama lain.')
        return
      }
      onOk(outcome)
    })
  }

  function open(next: RowMode) {
    setError(null)
    setMode(next)
    // A rename starts from the name it has: fixing a typo in one character should be a keystroke
    // and not a retype. `FolderMenu` prefills for the same reason.
    if (next === 'rename') setDraft(session.title)
  }

  const pin = () =>
    run(
      () => setNinaChatSessionPinned({ sessionId: session.id, pinned: !session.pinned }),
      () => {
        setMode('idle')
        // The list reorders on the SERVER (R4 pinned-first, R5 within it), so a refresh is the
        // whole update. Re-sorting the rows here would be the second opinion this phase promised
        // not to write.
        router.refresh()
      },
    )

  const rename = () =>
    run(
      () => renameNinaChatSession({ sessionId: session.id, title: draft }),
      () => {
        setMode('idle')
        router.refresh()
      },
    )

  const remove = () =>
    run(
      () => removeNinaChatSession({ sessionId: session.id, activeSessionId }),
      (result) => {
        /* The DESTINATION is phase 3's answer, not this component's. Its action returns `next` —
         * `'/nina'` to navigate, `null` to stay — so `planSessionRemoval` maps that answer onto the
         * two things the screen can do instead of recomputing "was this the active one" a second
         * time on the client. One decision, one owner. */
        const plan = planSessionRemoval({ next: result.next })
        if (plan.kind === 'navigate') {
          /*
           * `replace`, never `push`. The entry being replaced is the panel's own pushed entry and
           * the one under it is `?s=<the id just deleted>`; pushing would leave a back gesture that
           * lands on a dead session. It also drops `?sidebar=1`, so the panel closes and the runner
           * sees where he landed — which after deleting the conversation he was reading is the
           * reassuring outcome, not a surprise.
           *
           * The href is the BARE `/nina`: which chat opens when none is named is phase 3's rule,
           * and asking it is also, for free, the answer to "he removed his last one".
           */
          router.replace(plan.href)
          return
        }
        setMode('idle')
        router.refresh()
      },
    )

  const label = (
    <>
      <span className="block truncate text-[15px] leading-[1.35] font-semibold">
        {session.title}
      </span>
      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-ink-3">
        {session.pinned && <PinIcon />}
        {session.dayLabel !== null && <span>{session.dayLabel}</span>}
        {active && <span className="font-semibold text-ink-2">Open</span>}
      </span>
    </>
  )

  return (
    <div
      className={cn(
        'rounded-card px-3 py-2',
        // `Card.tsx`'s one surface for the open chat; bare paper for a reference to another one.
        active ? 'bg-card shadow-card' : 'bg-transparent',
      )}
    >
      <div className="flex items-center gap-2">
        {active ? (
          <button
            type="button"
            aria-current="page"
            onClick={onClose}
            className="min-w-0 flex-1 text-left text-ink"
          >
            {label}
          </button>
        ) : (
          <Link href={session.href} className="min-w-0 flex-1 text-left text-ink">
            {label}
          </Link>
        )}

        <button
          type="button"
          aria-label={`Aksi untuk ${session.title}`}
          aria-expanded={mode !== 'idle'}
          onClick={() => (mode === 'idle' ? open('menu') : setMode('idle'))}
          className="grid size-11 shrink-0 place-items-center rounded-pill text-[17px] font-semibold text-ink-3"
        >
          {mode === 'idle' ? '⋯' : '✕'}
        </button>
      </div>

      {mode === 'menu' && (
        <div className="mt-2">
          <div className="flex flex-wrap gap-2">
            <Button size="md" variant="secondary" loading={pending} onClick={pin}>
              {session.pinned ? 'Lepas pin' : 'Pin ke atas'}
            </Button>
            <Button size="md" variant="secondary" onClick={() => open('rename')}>
              Ganti nama
            </Button>
            {/* #136: no panel and no second tap. `loading` is `disabled` in `Button.tsx`, which is
                the one safeguard a one-tap mutation gets and the one `NinaJobActions` settled on. */}
            <Button size="md" variant="destructive" loading={pending} onClick={remove}>
              Hapus
            </Button>
          </div>
          {/* A refused pin or removal leaves THIS panel open, so the sentence belongs here —
              `run()`'s rule, and after #136 the menu is the panel a removal fires from. A rename's
              refusal renders in its own `Field` instead, where a form error reads. */}
          {error !== null && <p className="mt-2 text-[12px] font-semibold text-red">{error}</p>}
        </div>
      )}

      {mode === 'rename' && (
        <form
          className="mt-2"
          onSubmit={(event) => {
            event.preventDefault()
            rename()
          }}
        >
          <Field label="Nama chat" error={error ?? undefined}>
            <Input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              /* The cap, imported and not re-implemented — one number for the input and the
                 server's clamp. Everything else the server refuses. */
              maxLength={NINA_SESSION_TITLE_MAX_CHARS}
              autoComplete="off"
              enterKeyHint="done"
              className="font-semibold"
            />
          </Field>
          <div className="mt-3 flex gap-2">
            <Button type="submit" size="md" loading={pending}>
              Simpan
            </Button>
            <Button
              type="button"
              size="md"
              variant="ghost"
              disabled={pending}
              onClick={() => setMode('menu')}
            >
              Batal
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

/**
 * A thumbtack at 14px. Hand-written SVG for `TabBar`'s reason — "four glyphs is not worth a
 * package, and an icon font would be a second webfont on a page whose first is already Poppins".
 * `aria-hidden`, because the row's pin STATE is decoration next to a title that already reads; the
 * pin ACTION carries its own accessible name in the menu.
 */
function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" aria-hidden="true">
      <path
        d="M7.5 9.5a4.5 4.5 0 1 1 9 0c0 1.7-1 3-2 3.6-.6.4-1 1-1 1.7v.2h-3v-.2c0-.7-.4-1.3-1-1.7-1-.6-2-1.9-2-3.6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M12 15v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
