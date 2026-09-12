'use client'

import { useState } from 'react'

import { CheckIcon, SparklesIcon } from '@/components/admin/photoIcons'
import { Button, CONTROL_CLASS } from '@/components/ui'
import { ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS } from '@/lib/admin/chatPhotos'
import { cn } from '@/lib/cn'

/**
 * **The one describe control, for every photograph on the page — R3.** The stored prose rendered
 * in full and editable by hand, with the vision model one click away: always available, overwriting
 * whatever is stored, never confirming. Album rows and Media rows get the SAME component; the host
 * picks the actions, this file owns the interaction.
 *
 * ── IT IMPORTS NO SERVER ACTION ──────────────────────────────────────────────────────────────
 * `ChatPhotoDetail`'s rule for `ChatPhotoDescription`, kept because it is what makes the prop
 * renames impossible to miss: `onSave` and `onRedescribe` are handed in as closures by the arm
 * that mounts this panel — `AlbumSelectionPane` or `MediaPane`, each of which already knows which
 * table its row is backed by (Phase 2's dispatcher narrowed them). A rename in either action
 * family fails at the call site in that arm, not silently inside a component that guessed.
 *
 * ── A SAVE BUTTON, NOT COMMIT-ON-BLUR, AND NOT A CONFIRMATION ─────────────────────────────
 * R1's ruling — *"no need for all these bullshit confirmation"* — is about a SECOND click on
 * something. This is the FIRST click of the write, the distinction `MemoryTable.tsx:553-558` makes
 * in as many words for its own `+`. Commit-on-blur is right for that file (forty cells of 400
 * characters, `Escape` to revert); it is wrong for one 2000-character paragraph, where a stray blur
 * would silently store a half-finished sentence into Nina's prompt with nothing to say it happened.
 *
 * ── NO `<form>`, NO `router.refresh()` ────────────────────────────────────────────────────
 * `ChatPhotoDescription`'s shape and its cited reason. Both actions end in `revalidatePath`, and
 * Next 16 *"re-renders the current route server-side and includes a newly rendered RSC payload in
 * the action's response"*, so the saved (or re-described) prose arrives in the same round trip and
 * the box shows it — a `<form action={…}>` would need `useActionState` to surface the inline
 * error, which is a second error vocabulary on a screen that already has one.
 *
 * ── `draft === null` MEANS UNTOUCHED, WHICH IS WHY THERE IS NO EFFECT ─────────────────────
 * The box shows the SERVER's prose until the operator types; once he has typed, nothing from the
 * server can overwrite him. This is what makes a re-describe safe to fire while the box holds
 * unsaved text: the fresh prose arrives in the payload and is simply not shown while his draft
 * stands — his typing is never discarded by a machine pass, and the "unsaved" marker stays honest.
 * After a successful SAVE the draft is dropped back to `null`, which is what makes the marker
 * clear itself when the saved text comes back. The host still keys the pane per selection, which
 * covers the other direction: switching tiles with unsaved text in the box.
 *
 * ── ONE FLIGHT AT A TIME ─────────────────────────────────────────────────────────────────────
 * A save and a describe running concurrently would interleave two writes to one column with no
 * meaning attached to the winner, so while either is in flight the other is disabled (the
 * in-flight one shows the pulsing dots). The textarea is disabled during a SAVE — the value being
 * written must not change under the write — and left ENABLED during a DESCRIBE: an 8-11 s vendor
 * call must not lock him out of typing, and the draft rule above protects whatever he types.
 *
 * ── THE FONT SIZE IS `CONTROL_CLASS`'s AND IS NOT SHRUNK ─────────────────────────────────
 * `text-base` comes from `CONTROL_CLASS` and stays. Safari zooms the viewport when a control
 * smaller than 16 px takes focus and leaves it zoomed, and the design brief makes that one of the
 * rules that beats the design. The recipe is `ChatPhotoDescription`'s, verbatim.
 */

/** What either describe verb answers with. Both action result shapes satisfy it structurally. */
export interface DescribeOutcome {
  ok: boolean
  error?: string
  note?: string
}

export function PhotoDescription({
  description,
  emptyNote,
  onSave,
  onRedescribe,
}: {
  /** The row's stored prose, straight from the server. `null` is "not described yet". */
  description: string | null
  /**
   * The sentence for `description === null`, worded by the host for its table — the media rows
   * fill in from `scheduleChatPhotoCaption`'s `after()` pass moments after an add or a replace;
   * album rows fill in when the photo becomes hers. The panel shows it, and only the host can
   * know which promise is true.
   */
  emptyNote: string
  /** The hand-edit write. Receives the box's current text; an empty string clears the field. */
  onSave: (text: string) => Promise<DescribeOutcome>
  /** The vision-model write. Takes nothing, overwrites everything. */
  onRedescribe: () => Promise<DescribeOutcome>
}) {
  const stored = description ?? ''
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'describe' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const text = draft ?? stored
  const dirty = draft !== null && draft !== stored
  /* Mirrors the schema's transform, which trims before it decides, so the label cannot lie. */
  const willClear = text.trim().length === 0

  const save = async () => {
    if (busy !== null || !dirty) return
    setBusy('save')
    setError(null)
    setNote(null)
    try {
      const result = await onSave(text)
      if (!result.ok) {
        setError(result.error ?? 'That description did not stick.')
      } else {
        setNote(result.note ?? null)
        /* Back to "untouched", so the box follows the server again — and so the payload that
         * `revalidatePath` just produced, which carries exactly what was written, does not read as
         * an unsaved edit. */
        setDraft(null)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That save failed.')
    } finally {
      setBusy(null)
    }
  }

  const redescribe = async () => {
    if (busy !== null) return
    setBusy('describe')
    setError(null)
    setNote(null)
    try {
      const result = await onRedescribe()
      if (!result.ok) {
        setError(result.error ?? 'The description call failed. Try again.')
      } else {
        setNote(result.note ?? null)
        /* The draft is deliberately LEFT AS IT IS — see the docstring: his unsaved typing survives
         * the machine pass, and the fresh prose reaches the box the moment he saves or reverts. */
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The description call failed. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mt-5 border-t border-rule pt-4">
      <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-3 uppercase">
        What she can see in it
      </p>

      <textarea
        aria-label="What she can see in it"
        className={cn(CONTROL_CLASS, 'min-h-[104px] resize-y py-2 leading-relaxed')}
        value={text}
        maxLength={ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS}
        disabled={busy === 'save'}
        placeholder="Not described yet."
        onChange={(event) => {
          setDraft(event.target.value)
          setError(null)
          setNote(null)
        }}
      />

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {/*
         * R1: a check glyph, not a word. `Clear` when an emptied box would null a row that HAS
         * prose — the distinction the old label carried moves whole into the accessible name and
         * the tooltip, and stays out of the layout. Still one click, the first click; still not a
         * confirmation.
         */}
        <Button
          type="button"
          size="md"
          variant="secondary"
          className="w-11 px-0"
          aria-label={
            willClear && description !== null ? 'Clear the description' : 'Save the description'
          }
          title={
            willClear && description !== null ? 'Clear the description' : 'Save the description'
          }
          loading={busy === 'save'}
          disabled={busy !== null || !dirty}
          onClick={() => void save()}
        >
          <CheckIcon className="size-4" />
        </Button>

        {/*
         * ALWAYS rendered — the null guard the pane used to put around this verb was the defect R3
         * exists to remove: a described photo with wrong prose had no way to re-run the eyes. It
         * OVERWRITES, and the accessible name says so once the row has prose; there is no
         * confirmation, because the hand-edit box above is the correction path.
         */}
        <Button
          type="button"
          size="md"
          variant="secondary"
          className="w-11 px-0"
          aria-label={description == null ? 'Describe it' : 'Re-describe it — it overwrites'}
          title={description == null ? 'Describe it' : 'Re-describe it — it overwrites'}
          loading={busy === 'describe'}
          disabled={busy !== null}
          onClick={() => void redescribe()}
        >
          <SparklesIcon className="size-4" />
        </Button>

        <span className="text-[11px] font-medium text-ink-3 tabular-nums">
          {text.length}/{ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS}
        </span>
        {dirty && <span className="text-[11px] font-semibold text-accent">unsaved</span>}
      </div>

      {/*
       * The honest sentence about the ROW's state, kept from `ChatPhotoDescription` and kept for
       * its original reason: after an add, a replace, or a promotion this field is NULL for the
       * few seconds the `after()` describe pass takes, and then fills in on the next load. A field
       * that is merely empty would read as a permanent defect for a photograph that is about to be
       * fine. The WORDS are the host's, because which promise is true depends on the table.
       */}
      {description === null && !dirty && (
        <p className="mt-1.5 text-[12px] leading-relaxed font-medium text-ink-3">{emptyNote}</p>
      )}

      {/* Both lines answer an awaited write, so both are live regions — the action resolved
       * after focus already moved on (`MemoryTable`'s result-line rule). */}
      {error !== null && (
        <p role="alert" className="mt-1.5 text-[12px] font-medium text-red">
          {error}
        </p>
      )}
      {note !== null && (
        <p role="status" className="mt-1.5 text-[12px] font-medium text-ink-3">
          {note}
        </p>
      )}
    </section>
  )
}
