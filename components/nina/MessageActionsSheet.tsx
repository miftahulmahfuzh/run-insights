'use client'

import { useState } from 'react'

import { Button } from '@/components/ui'
import { Sheet } from '@/components/ui/Sheet'
import { cn } from '@/lib/cn'
import {
  describeMessageDeletion,
  editCapFor,
  planMessageEdit,
  type EditTarget,
} from '@/lib/nina/edit'

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
 * ── THE DELETE CONFIRMATION IS THE ONE IN THIS FEATURE, AND IT IS NOT OPTIONAL ────────────────
 * There is no confirm dialog anywhere else in this codebase, and an undo would need an archive
 * flag the plan set rules out. A mis-tap here takes a message and its photos permanently, so the
 * second tap is the only thing standing between the two. The sentence it shows is
 * `describeMessageDeletion`, in `lib/`, with a unit test — what a destructive action discloses is
 * exactly the kind of thing that drifts when it lives in markup.
 */

type Mode = 'menu' | 'edit' | 'confirm'

export function MessageActionsSheet({
  target,
  photoCount,
  onClose,
  onSubmitEdit,
  onConfirmDelete,
}: {
  /** The message the gesture picked, or null — which renders nothing at all. */
  target: EditTarget | null
  /** How many photos this message carries, for the confirmation's disclosure. */
  photoCount: number
  onClose: () => void
  /** Resolves true when the row was written and the caller has patched its list. */
  onSubmitEdit: (id: string, body: string) => Promise<boolean>
  /** Resolves true when the row is gone and the caller has dropped it. */
  onConfirmDelete: (id: string) => Promise<boolean>
}) {
  const [mode, setMode] = useState<Mode>('menu')
  const [value, setValue] = useState(target?.body ?? '')
  const [pending, setPending] = useState(false)
  /** A refusal `planMessageEdit` decided locally, so the runner is not made to wait for a POST. */
  const [refusal, setRefusal] = useState<string | null>(null)

  if (target === null) return null

  /* Hoisted after the null guard so the two async closures below close over a narrowed value —
   * TypeScript cannot carry the narrowing across a closure boundary, and a non-null assertion
   * would state the same fact less honestly. */
  const picked = target
  const whose = picked.mine ? 'your message' : 'Nina’s message'
  const max = editCapFor(picked.mine)

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

  async function confirmDelete() {
    if (pending) return
    setPending(true)
    const ok = await onConfirmDelete(picked.id)
    setPending(false)
    if (ok) onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={mode === 'edit' ? 'Edit message' : mode === 'confirm' ? 'Delete message' : 'Message'}
      subtitle={
        mode === 'menu'
          ? 'Whatever this says is what Nina reads as context on her next reply.'
          : undefined
      }
    >
      {mode === 'menu' && (
        <div className="space-y-2">
          {/*
            The message itself, so the runner can see WHICH one he swiped before he acts on it. A
            gesture picks a target he cannot re-check once the sheet covers the screen, and getting
            the wrong bubble is the mis-tap this whole surface exists to prevent.
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

          <Button
            fullWidth
            variant="secondary"
            onClick={() => {
              setRefusal(null)
              setValue(picked.body)
              setMode('edit')
            }}
          >
            Edit {whose}
          </Button>

          <Button fullWidth variant="destructive" onClick={() => setMode('confirm')}>
            Delete {whose}
          </Button>
        </div>
      )}

      {mode === 'edit' && (
        <div className="space-y-3">
          <label className="sr-only" htmlFor="nina-message-edit">
            Message text
          </label>
          <textarea
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
              'w-full resize-y rounded-field bg-paper-2 px-4 py-3',
              'font-medium text-ink outline-none placeholder:font-medium placeholder:text-ink-3',
              'focus-visible:ring-2 focus-visible:ring-accent',
            )}
            placeholder={picked.mine ? 'What you meant to say' : 'What she should have said'}
          />

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

      {mode === 'confirm' && (
        <div className="space-y-3">
          <p className="text-[14px] leading-snug font-medium text-ink">
            {describeMessageDeletion(picked, photoCount)}
          </p>

          <div className="flex gap-2">
            <Button
              fullWidth
              variant="secondary"
              disabled={pending}
              onClick={() => setMode('menu')}
            >
              Keep it
            </Button>
            <Button fullWidth variant="destructive" loading={pending} onClick={confirmDelete}>
              Delete
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
