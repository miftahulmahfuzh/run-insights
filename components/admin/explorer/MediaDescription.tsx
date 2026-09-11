'use client'

import { useState } from 'react'

import { CheckIcon } from '@/components/admin/photoIcons'
import { Button, CONTROL_CLASS } from '@/components/ui'
import { editChatPhotoDescriptionAction } from '@/lib/admin/chatPhotoActions'
import { ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS } from '@/lib/admin/chatPhotos'
import { cn } from '@/lib/cn'

/**
 * **"What she can see in it", editable** — for a Media row. The purged `/admin/photos` surface's
 * `ChatPhotoDescription`, migrated so the hand-edit verb survives the purge: a vision pass that
 * failed, or a wrong paragraph, is correctable by the operator for EITHER kind of row (the kind
 * refusal in `editChatPhotoDescriptionAction` is lifted with the merge).
 *
 * SEAM — PHASE 3. This file is the interim describe control, not the destination: the plan set's
 * R3 replaces it — and the pane's eye toggle around it — with ONE unified describe panel serving
 * album rows and media rows alike (stored prose rendered and editable, plus an always-available
 * re-describe button). Replace this file wholesale in Phase 3; nothing else in the explorer needs
 * to change when that happens, which is the whole reason it is its own file.
 *
 * ── A SAVE BUTTON, NOT COMMIT-ON-BLUR, AND NOT A CONFIRMATION ─────────────────────────────
 * R1's ruling — *"no need for all these bullshit confirmation"* — is about a SECOND click on
 * something. This is the FIRST click of the write. Commit-on-blur is wrong for one 2000-character
 * paragraph: a stray blur would silently store a half-finished sentence into Nina's prompt.
 *
 * ── NO `<form>`, NO `router.refresh()` ────────────────────────────────────────────────────
 * The action ends with `revalidatePath(ADMIN_CHAT_PHOTOS_PATH)` (`/admin/nina` since the merge),
 * and Next 16 *"re-renders the current route server-side and includes a newly rendered RSC Payload
 * in the action's response"*, so the pane gets the saved text back in the same round trip.
 *
 * ── `draft === null` MEANS UNTOUCHED, WHICH IS WHY THERE IS NO EFFECT ─────────────────────
 * The box shows the SERVER's prose until the operator types, so when `after()`'s describe pass
 * lands while the pane is open, the next payload's text simply appears; and once he has typed,
 * nothing from the server can overwrite him. `MediaPane` keys this by `photo.id`, which covers the
 * other direction: switching tiles with unsaved text in the box.
 */
export function MediaDescription({
  photoId,
  description,
}: {
  photoId: string
  /** The row's stored prose, straight from the server. `null` is "not described yet". */
  description: string | null
}) {
  const stored = description ?? ''
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const text = draft ?? stored
  const dirty = draft !== null && draft !== stored
  /* Mirrors the schema's transform, which trims before it decides, so the label cannot lie. */
  const willClear = text.trim().length === 0

  const onSave = async () => {
    if (busy || !dirty) return
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const result = await editChatPhotoDescriptionAction({ id: photoId, description: text })
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
      setBusy(false)
    }
  }

  return (
    <div>
      <textarea
        aria-label="What she can see in it"
        className={cn(CONTROL_CLASS, 'min-h-[104px] resize-y py-2 leading-relaxed')}
        value={text}
        maxLength={ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS}
        disabled={busy}
        placeholder="Not described yet."
        onChange={(event) => {
          setDraft(event.target.value)
          setError(null)
          setNote(null)
        }}
      />

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="md"
          variant="secondary"
          aria-label={
            willClear && description !== null ? 'Clear the description' : 'Save the description'
          }
          title={
            willClear && description !== null ? 'Clear the description' : 'Save the description'
          }
          className="w-11 px-0"
          loading={busy}
          disabled={busy || !dirty}
          onClick={() => void onSave()}
        >
          <CheckIcon className="size-4" />
        </Button>
        <span className="text-[11px] font-medium text-ink-3 tabular-nums">
          {text.length}/{ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS}
        </span>
        {dirty && <span className="text-[11px] font-semibold text-accent">unsaved</span>}
      </div>

      {/*
       * The honest sentence about the ROW's state: after an Add or Replace this field is NULL for
       * the few seconds `scheduleChatPhotoCaption`'s `after()` pass takes, and then fills in on the
       * next load. A field that is merely empty would read as a permanent defect for a photograph
       * that is about to be fine.
       */}
      {description === null && !dirty && (
        <p className="mt-1.5 text-[12px] leading-relaxed font-medium text-ink-3">
          She cannot talk about this photo until it is described &mdash; reload in a moment if it
          was just added or replaced, or write it yourself.
        </p>
      )}

      {error !== null && <p className="mt-1.5 text-[12px] font-medium text-red">{error}</p>}
      {note !== null && <p className="mt-1.5 text-[12px] font-medium text-ink-3">{note}</p>}
    </div>
  )
}
