'use client'

import { useState } from 'react'

import { CheckIcon } from '@/components/admin/photoIcons'
import { Button, CONTROL_CLASS } from '@/components/ui'
import { editChatPhotoDescriptionAction } from '@/lib/admin/chatPhotoActions'
import { ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS } from '@/lib/admin/chatPhotos'
import { cn } from '@/lib/cn'

/**
 * **"What she can see in it", editable.** R2 of `nina-photo-refs-and-bubble-actions`, verbatim:
 * *"there is a 'what she can see in it' field. make this field editable by user"*.
 *
 * A sibling of `ChatPhotoAdd` (the collection verb) and `ChatPhotoControls` (the two per-row verbs),
 * and it is its own file for the reason those two are: `ChatPhotoDetail`'s header states that it
 * *"imports no Server Action itself: the controls own that, so a prop rename here cannot reach a
 * mutation."* That boundary is kept exactly — the rail mounts this and reads nothing back from it.
 *
 * ── A SAVE BUTTON, NOT COMMIT-ON-BLUR, AND NOT A CONFIRMATION ─────────────────────────────
 * R1's ruling — *"no need for all these bullshit confirmation"* — is about a SECOND click on
 * something. This is the FIRST click of the write, the distinction `MemoryTable.tsx:553-558` makes
 * in as many words for its own `+`. Commit-on-blur is right for that file (forty cells of 400
 * characters, `Escape` to revert); it is wrong for one 2000-character paragraph, where a stray blur
 * would silently store a half-finished sentence into Nina's prompt with nothing to say it happened.
 *
 * ── NO `<form>`, NO `router.refresh()` ────────────────────────────────────────────────────
 * `ChatPhotoControls`'s shape and its cited reason. The action ends with
 * `revalidatePath(ADMIN_CHAT_PHOTOS_PATH)`, and Next 16 *"re-renders the current route server-side
 * and includes a newly rendered RSC Payload in the action's response"*, so the rail gets the saved
 * text back in the same round trip. A `<form action={…}>` would need `useActionState` to surface the
 * inline error, which is a second error vocabulary on a screen that already has one.
 *
 * ── `draft === null` MEANS UNTOUCHED, WHICH IS WHY THERE IS NO EFFECT ─────────────────────
 * The box shows the SERVER's prose until the operator types. So when `after()`'s describe pass lands
 * while the rail is open, the next payload's text simply appears; and once he has typed, nothing
 * from the server can overwrite him. No `useEffect`, no sync, no dependency array. After a
 * successful save the draft is dropped back to `null`, which is also what makes the "unsaved" marker
 * clear itself when the saved text comes back.
 *
 * The caller still keys this by `photo.id` — see the mount in `ChatPhotoDetail`. That covers the
 * OTHER direction, which an untouched-means-server rule cannot: switching tiles with unsaved text in
 * the box.
 *
 * ── THE FONT SIZE IS `CONTROL_CLASS`'s AND IS NOT SHRUNK ─────────────────────────────────
 * `text-base` comes from `CONTROL_CLASS` and stays. `MemoryTable.tsx:71-80` and
 * `components/ui/Field.tsx:85-92` both state the rule: Safari zooms the viewport when a control
 * smaller than 16 px takes focus and leaves it zoomed, and the design brief makes that one of the
 * rules that beats the design. The recipe below is `CharacterPanel.tsx:401-409`'s, with a taller
 * `min-h` and the `leading-relaxed` the read-only paragraph had.
 */
export function ChatPhotoDescription({
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
       * The honest sentence about the ROW's state, kept from the read-only version and kept for its
       * original reason: after an admin Add or Replace this field is NULL for the few seconds
       * `scheduleChatPhotoCaption`'s `after()` pass takes, and then fills in on the next load. A
       * field that is merely empty would read as a permanent defect for a photograph that is about
       * to be fine. The last clause is all this phase changes about it — he no longer has to wait
       * for the model if he would rather say it himself.
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
