'use client'

import { useRef, useState } from 'react'

import { Button } from '@/components/ui'
import { Sheet } from '@/components/ui/Sheet'
import { cn } from '@/lib/cn'
import { canResendMessage, editCapFor, planMessageEdit, type EditTarget } from '@/lib/nina/edit'

/**
 * R8's surface: rewrite this message, or remove it. Three states in one sheet.
 *
 * ── WHY A SHEET AND NOT AN INLINE ROW UNDER THE BUBBLE ────────────────────────────────────────
 * An inline reveal changes `document.documentElement.scrollHeight`, and this screen is unusually
 * sensitive to that. `MessageList` samples `isNearBottom` off the document on a passive scroll
 * listener and feeds it to `decideAutoScroll`; `resolveRestoreTop` re-derives R14's scroll mark
 * from a live anchor position. An expanding row moves the reader while he is deciding whether to
 * delete something. A `fixed inset-0` overlay changes no document geometry at all.
 *
 * `components/ui/Sheet.tsx` is also the app's ONE modal surface and already carries the three
 * behaviours this needs and would otherwise have to reinvent: the backdrop scroll-locks the body,
 * focus moves in on open and back out on close, and `onCloseRef` defuses the trap that "cost one
 * keyboard per keystroke on the review screen". It is reused unmodified.
 *
 * ── IT OWNS ITS OWN DRAFT, AND THAT IS THAT SAME BUG FIXED IN ADVANCE ─────────────────────────
 * `value` lives here, not in `ChatScreen`, so a keystroke re-renders this component and nothing
 * above it — no `MessageList`, no 200 bubbles, and above all no `Sheet` effect teardown. That is
 * `Composer`'s rule ("it owns its own text, and that is a bug fix written in advance") applied to
 * the second text input on this screen. `ChatScreen` gives the element a `key` of the target's id,
 * which is what resets the draft when a different message is picked; that is the deliberate
 * inverse of `Composer`'s "never given a `key` that changes", because here a reset is the correct
 * behaviour and there it was the bug.
 *
 * ── 16px, NOT 15 ──────────────────────────────────────────────────────────────────────────────
 * `app/globals.css` sets `input, select, textarea { font-size: max(16px, 1rem) }` because Safari
 * zooms the viewport when you focus anything smaller. Same rule, same non-negotiability as
 * `Composer`'s: no `text-[15px]` here to match the bubble.
 *
 * ── THE DELETE CONFIRMATION, AND WHY IT IS GONE ───────────────────────────────────────────────
 * This sheet carried this feature's only confirm step — a second page with "Keep it" / "Delete" —
 * on the argument that a mis-tap takes a message and its photos permanently. The repo owner
 * overruled it outright: "remove the confirmation message when user delete nina's message, and
 * also when user delete his own message in the chat". Delete is now immediate from the menu, for
 * Nina's rows and his own alike. What survives of the old argument is the gesture itself: picking
 * a message already takes a deliberate long-press, swipe or focus-revealed button, and the
 * preview below still shows WHICH bubble is about to go. The confirmation sentence
 * (`describeMessageDeletion`, and the `photoCount` prop that fed it) was deleted with the step
 * that showed it; it lives in git history if the overrule is ever reversed.
 *
 * ── THE FAILED ROW, WHICH IS A RETRY SURFACE FIRST ────────────────────────────────────────────
 * `ChatScreen` opens this sheet for a FAILED own row (red hairline, never delivered), and
 * `retryable` says which of the two failed shapes it is: with no photos the menu leads with "Send
 * it again" — the owner's actual report was wanting exactly that and being answered with an edit
 * refusal — and with photos there is no retry to offer, because the tickets were signed
 * server-side and did not survive the failure, so the sheet says that in words rather than
 * offering a button that would silently drop them. Delete is offered either way; on a `local-`
 * id it is purely local, which is `handleDeleteMessage`'s business, not this sheet's.
 *
 * A RETRY and a RESEND are different acts and the two buttons never share a row: `canResendMessage`
 * requires a confirmed id (it is `canActOnMessage` plus `mine`), so R5's "Resend your message" —
 * which re-runs Nina's turn for a row already in the log — appears only on the confirmed menu, and
 * the failed menu's "Send it again" appears only on a row that never reached the log.
 */

type Mode = 'menu' | 'edit'

export function MessageActionsSheet({
  target,
  retryable,
  onRetry,
  onClose,
  onSubmitEdit,
  onDelete,
  onResend,
}: {
  /** The message the gesture picked, or null — which renders nothing at all. */
  target: EditTarget | null
  /**
   * True when the picked row is a failed send that CAN be retried: it is the caller's own row,
   * unconfirmed, and carries no photos. Only meaningful together with a `target` that is not
   * confirmed; a confirmed target renders the confirmed menu.
   */
  retryable: boolean
  /** Runs the retry. Resolves true when the send was accepted and the caller replaced the row. */
  onRetry: () => Promise<boolean>
  onClose: () => void
  /** Resolves true when the row was written and the caller has patched its list. */
  onSubmitEdit: (id: string, body: string) => Promise<boolean>
  /** Resolves true when the row is gone and the caller has dropped it. */
  onDelete: (id: string) => Promise<boolean>
  /**
   * R5. Re-run Nina's turn for this message. **Resolves `null` when the turn was claimed** — the
   * cue to close, exactly as `true` is for the two above — and otherwise the SENTENCE to show as
   * this sheet's refusal.
   *
   * ── WHY A STRING AND NOT A BOOLEAN, WHEN ITS SIBLINGS ARE BOOLEANS ───────────────────────────
   * Because a resend has a refusal that is not a failure — a turn is already running for this
   * conversation, so the message will be answered anyway — and the runner has to be told which of
   * the two happened. The sheet is the surface covering the screen at that moment: `ChatScreen`'s
   * `Notice` strip renders BEHIND it and would not be read until the sheet closed, so a notice
   * would be a message delivered to nobody.
   *
   * The COPY still belongs to `ChatScreen`, which already owns `NOTICE_TEXT`, so this component
   * imports no Server Action and never learns the refusal vocabulary — the same boundary
   * `onSubmitEdit` and `onDelete` keep.
   *
   * REQUIRED rather than optional, on RULING E5b's habit: `ChatScreen` is the one caller and `tsc`
   * should be what notices if it stops passing it. An optional callback defaulting to a no-op is
   * how a menu item comes to do nothing at all.
   */
  onResend: (id: string) => Promise<string | null>
}) {
  const [mode, setMode] = useState<Mode>('menu')
  const [value, setValue] = useState(target?.body ?? '')
  const [pending, setPending] = useState(false)
  const editFieldRef = useRef<HTMLTextAreaElement>(null)
  /** A refusal `planMessageEdit` decided locally, so the runner is not made to wait for a POST. */
  const [refusal, setRefusal] = useState<string | null>(null)

  if (target === null) return null

  /* Hoisted after the null guard so the two async closures below close over a narrowed value —
   * TypeScript cannot carry the narrowing across a closure boundary, and a non-null assertion
   * would state the same fact less honestly. */
  const picked = target
  const whose = picked.mine ? 'your message' : 'Nina’s message'
  const max = editCapFor(picked.mine)
  /* The failed shape, as distinct from the confirmed one the menu was written for. `ChatScreen`
   * only opens the sheet for a failed row when it is his own, so this never names hers. */
  const failed = !picked.confirmed

  async function submitEdit() {
    if (pending) return
    /* The same rule the server will run, run here first — so an over-long paste or a cleared
     * text-only message is answered instantly instead of after a round trip. The server still runs
     * it: this is the client half of one rule, not a substitute for it. */
    const plan = planMessageEdit(picked, value)
    if (plan.kind === 'unchanged') {
      onClose()
      return
    }
    if (plan.kind === 'too-long') {
      setRefusal(`That is ${plan.over} characters too long. The limit here is ${plan.max}.`)
      return
    }
    if (plan.kind === 'delete-instead') {
      setRefusal('Clearing the text leaves nothing. Delete the message instead.')
      return
    }
    if (plan.kind === 'not-editable') {
      setRefusal('This message is not on the server yet.')
      return
    }

    setRefusal(null)
    setPending(true)
    const ok = await onSubmitEdit(picked.id, plan.body)
    setPending(false)
    if (ok) onClose()
  }

  /* Immediate, on the owner's overrule of the confirm step — see the header. `pending` is shared
   * with the edit and resend paths so two of the three can never overlap. */
  async function runDelete() {
    if (pending) return
    setPending(true)
    const ok = await onDelete(picked.id)
    setPending(false)
    if (ok) onClose()
  }

  /**
   * The failed row's own action. Unlike `resend()` below this resolves a boolean — a failed retry
   * IS a failure, the row is still failed and still here — so the sheet stays open on false with
   * the one sentence that is true of it, rather than a caller-authored refusal vocabulary.
   */
  async function retrySend() {
    if (pending) return
    setRefusal(null)
    setPending(true)
    const ok = await onRetry()
    setPending(false)
    /* On failure the row stays failed and the sheet stays open — closing it would read as
     * "sent", which is exactly the lie this surface exists not to tell. */
    if (ok) onClose()
    else setRefusal('It still did not reach Nina. Give it a moment and try again.')
  }

  /**
   * R5. One tap, one claim.
   *
   * `pending` is the SHARED flag the other paths use, so an edit, a delete, a retry and a resend
   * cannot overlap — and the menu buttons gain `disabled={pending}` below for the same reason:
   * leaving `menu` mode mid-resend would strand the spinner on a button nobody can see.
   *
   * The refusal is rendered rather than thrown away, and the sheet STAYS OPEN on one: 'she is
   * already answering that one' is information the runner needs while the message is still in front
   * of him, and closing the sheet would leave him with a tap that visibly did nothing.
   */
  async function resend() {
    if (pending) return
    setRefusal(null)
    setPending(true)
    const refused = await onResend(picked.id)
    setPending(false)
    if (refused === null) {
      onClose()
      return
    }
    setRefusal(refused)
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={mode === 'edit' ? 'Edit message' : 'Message'}
      subtitle={
        mode === 'menu' && failed
          ? 'This did not reach Nina — the red outline marks a send that failed.'
          : mode === 'menu'
            ? 'Whatever this says is what Nina reads as context on her next reply.'
            : undefined
      }
    >
      {mode === 'menu' && (
        <div className="space-y-2">
          {/*
            The message itself, so the runner can see WHICH one he swiped before he acts on it. A
            gesture picks a target he cannot re-check once the sheet covers the screen, and getting
            the wrong bubble is the mis-tap this whole surface exists to prevent — and, since the
            confirm step went, the LAST check there is.
            `whitespace-pre-wrap` and `line-clamp-4` for the same reasons the bubble and the quote
            stub use them: her line breaks are part of how she talks, and a 700-character bubble
            must not push the buttons below the fold.
          */}
          <p
            className={cn(
              'rounded-field bg-paper-2 p-3.5 text-[13px] leading-snug font-medium text-ink-2',
              'line-clamp-4 break-words whitespace-pre-wrap',
            )}
          >
            {picked.body.length > 0 ? picked.body : 'No text — a photo, or a shared run.'}
          </p>

          {failed ? (
            <>
              {retryable ? (
                <Button fullWidth loading={pending} onClick={retrySend}>
                  Send it again
                </Button>
              ) : (
                /* The other failed shape: photos were attached, and a retry cannot carry them —
                   the tickets were spent or lost when the first send cleared the composer's
                   tiles. An honest sentence instead of a button that would silently drop them;
                   the photos themselves are still in the album. */
                <p className="px-1 text-[12px] leading-snug font-medium text-ink-3">
                  Its photos cannot be re-sent — attach them to a new message instead.
                </p>
              )}
              <Button fullWidth variant="destructive" disabled={pending} onClick={runDelete}>
                Delete {whose}
              </Button>
            </>
          ) : (
            <>
              <Button
                fullWidth
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setRefusal(null)
                  setValue(picked.body)
                  setMode('edit')
                }}
              >
                Edit {whose}
              </Button>

              {/*
                R5, and HIS bubbles only — `canResendMessage` is the gate, in `lib/nina/edit.ts` beside
                `canActOnMessage`, so "which bubbles offer a resend" is a rule with a unit test rather
                than a condition in markup. There is no "was this answered" test here: the plan index
                settled that a client-side one would be a second authority on turn state beside
                `nina_turns`, and `resendNinaMessage` refuses when a claim is already live.

                Between Edit and Delete deliberately. Delete stays last because it is the destructive
                one, and Resend is the only item here that changes nothing about the message.
              */}
              {canResendMessage(picked) && (
                <>
                  <Button fullWidth variant="secondary" loading={pending} onClick={resend}>
                    Resend your message
                  </Button>
                  {/*
                    Invariant 7, in the runner's own words. He is about to press a button labelled
                    "resend" on a message that is already in the log, and the thing he will reasonably
                    fear is a second copy of it appearing. It cannot: the action re-opens a turn for
                    this exact row and never calls `insertNinaMessages`.
                  */}
                  <p className="text-[11px] font-medium text-ink-3">
                    She answers the message that is already here. Nothing gets sent twice.
                  </p>
                </>
              )}

              <Button fullWidth variant="destructive" disabled={pending} onClick={runDelete}>
                Delete {whose}
              </Button>
            </>
          )}

          {/* The resend's refusal, and the retry's. `menu` mode had no refusal line before R5;
            `edit` mode's own copy of it is unchanged, and all three read the same state. */}
          {refusal !== null && <p className="text-[11px] font-semibold text-red">{refusal}</p>}
        </div>
      )}

      {mode === 'edit' && (
        <div className="space-y-3">
          <label className="sr-only" htmlFor="nina-message-edit">
            Message text
          </label>
          <div className="relative">
            <textarea
              ref={editFieldRef}
              id="nina-message-edit"
              rows={5}
              value={value}
              maxLength={max}
              onChange={(event) => {
                setValue(event.target.value)
                setRefusal(null)
              }}
              /* No Enter-to-submit, unlike the composer. Enter there sends a chat message and a
                 newline needs Shift; here the runner is repairing prose that may already contain
                 newlines, and a stray Enter must not commit a half-finished correction. Save is a
                 button. */
              className={cn(
                'w-full resize-y rounded-field bg-paper-2 py-3 pr-11 pl-4',
                'font-medium text-ink outline-none placeholder:font-medium placeholder:text-ink-3',
                'focus-visible:ring-2 focus-visible:ring-accent',
              )}
              placeholder={picked.mine ? 'What you meant to say' : 'What she should have said'}
            />
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setValue('')
                  setRefusal(null)
                  /* The click blurs the textarea before this runs, which would dismiss the
                     keyboard — refocus explicitly so it stays up for the next word. */
                  editFieldRef.current?.focus()
                }}
                aria-label="Clear text"
                className="absolute top-3 right-2 grid size-7 place-items-center rounded-pill text-ink-3 active:scale-[0.97]"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>

          <p className="text-[11px] font-medium text-ink-3">
            {picked.mine
              ? 'She reads this on her next reply as if it is what you said.'
              : 'She reads this on her next reply as if it is what she said.'}
          </p>

          {refusal !== null && <p className="text-[11px] font-semibold text-red">{refusal}</p>}

          <div className="flex gap-2">
            <Button
              fullWidth
              variant="secondary"
              disabled={pending}
              onClick={() => setMode('menu')}
            >
              Back
            </Button>
            <Button fullWidth loading={pending} onClick={submitEdit}>
              Save
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
