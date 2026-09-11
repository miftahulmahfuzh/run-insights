'use client'

import { useRef, useState } from 'react'

import { SwapIcon, TrashIcon } from '@/components/admin/photoIcons'
import { Button } from '@/components/ui'
import { removeChatPhotoAction, replaceChatPhotoAction } from '@/lib/admin/chatPhotoActions'

import { uploadChatPhoto } from './chatPhotoUpload'

/**
 * Replace and Remove, for one row of the Media folder — the purged `/admin/photos` rail's
 * `ChatPhotoControls`, migrated with its fragment idiom intact: the two buttons are FRAGMENT
 * children so the selection pane's single icon row is their flex parent, the hidden input rides
 * along invisibly, and the inline messages carry `basis-full` so a flex-wrap parent pushes them
 * onto their own line under the icons instead of squeezing them between buttons.
 *
 * ── NO CONFIRMATION, AND THAT IS THE REQUIREMENT ────────────────────────────────────────────
 * *"i am the only one using this app, no need for all these bullshit confirmation"*. Remove calls
 * the action on click. Replace opens the file picker on click and uploads on `change`. There is no
 * dialog, no `window.confirm`, no typed string, no second button and no `confirming` state — the
 * `busy` state below exists only to stop a double-click firing two uploads, which is a different
 * thing entirely.
 *
 * ── BOTH VERBS WORK ON BOTH KINDS ───────────────────────────────────────────────────────────
 * The kind refusal the old rail's actions carried is lifted (`replaceChatPhotoAction`'s docstring
 * has the argument); the reference refusal is not — a row that re-shows a photograph living
 * elsewhere answers with its exact sentence, inline here.
 *
 * ── `note` GOES UP, NOT DOWN ────────────────────────────────────────────────────────────────
 * A removed photograph whose Blob object is still referenced by another row keeps its bytes in the
 * store, and the action says so. `ok` is true and the operation did what was asked; the operator
 * gets the sentence anyway. But this pane unmounts the instant `revalidatePath`'s RSC payload
 * arrives without the removed row, so a note rendered HERE would be destroyed before it could be
 * read. `onRemoved(note)` hands it to `FileExplorer`, which does not unmount. Replace does not
 * unmount anything, so its note stays local.
 *
 * ── NO `router.refresh()` ───────────────────────────────────────────────────────────────────
 * Next 16's Server Actions guide: *"When `updateTag`, `revalidatePath`, or `refresh` runs, Next.js
 * re-renders the current route server-side and includes a newly rendered RSC Payload in the action's
 * response, so the page reflects the change in the same roundtrip."* Every action here ends with
 * `revalidatePath(ADMIN_CHAT_PHOTOS_PATH)` — `/admin/nina` since the merge — so the grid updates
 * with no second request.
 */
export function MediaControls({
  userId,
  photoId,
  onRemoved,
}: {
  /** The signed-in admin's id, from the server prop chain — it builds the Blob pathname. */
  userId: string
  photoId: string
  /** Called on a successful remove, carrying the action's `note` (`null` when there is none). */
  onRemoved: (note: string | null) => void
}) {
  const [busy, setBusy] = useState<'idle' | 'replacing' | 'removing'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Clearing the input is what makes picking the SAME file twice fire `change` again.
    event.target.value = ''
    if (file == null || busy !== 'idle') return

    setBusy('replacing')
    setError(null)
    setNote(null)
    try {
      const uploaded = await uploadChatPhoto(userId, file)
      const result = await replaceChatPhotoAction({ id: photoId, ...uploaded })
      if (!result.ok) setError(result.error ?? 'That replacement did not stick.')
      else if (result.note != null) setNote(result.note)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That upload failed.')
    } finally {
      setBusy('idle')
    }
  }

  const onRemove = async () => {
    if (busy !== 'idle') return
    setBusy('removing')
    setError(null)
    setNote(null)
    try {
      const result = await removeChatPhotoAction({ id: photoId })
      if (!result.ok) setError(result.error ?? 'That photo did not go away.')
      else onRemoved(result.note ?? null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That removal failed.')
    } finally {
      setBusy('idle')
    }
  }

  return (
    <>
      {/*
       * Icons, no text — the verbs live in `aria-label`/`title`, the destructive red stays on
       * the trash, and `loading` keeps each square box while its dots run. `w-11 px-0` squares the
       * `md` button: 44 px of tap target either way — the pane's own `RAIL_BUTTON` idiom.
       */}
      <Button
        type="button"
        size="md"
        variant="secondary"
        aria-label="Replace this photo"
        title="Replace this photo"
        className="w-11 px-0"
        loading={busy === 'replacing'}
        disabled={busy !== 'idle'}
        onClick={() => fileRef.current?.click()}
      >
        <SwapIcon className="size-4" />
      </Button>
      <Button
        type="button"
        size="md"
        variant="destructive"
        aria-label="Remove this photo"
        title="Remove this photo"
        className="w-11 px-0"
        loading={busy === 'removing'}
        disabled={busy !== 'idle'}
        onClick={() => void onRemove()}
      >
        <TrashIcon className="size-4" />
      </Button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void onPick(event)}
      />

      {error !== null && <p className="basis-full text-[12px] font-medium text-red">{error}</p>}
      {note !== null && <p className="basis-full text-[12px] font-medium text-ink-3">{note}</p>}
    </>
  )
}
