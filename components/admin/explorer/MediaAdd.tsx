'use client'

import { useRef, useState } from 'react'

import { PlusIcon } from '@/components/admin/photoIcons'
import { Button } from '@/components/ui'
import { addChatPhotoAction } from '@/lib/admin/chatPhotoActions'

import { uploadChatPhoto } from './chatPhotoUpload'

/**
 * The Media view's "Add photos" — *"add a new photo (so it is like nina generated them, but
 * actually it is manually added by user)"*. Migrated from the purged `/admin/photos` surface's
 * `ChatPhotoAdd`, unchanged in behavior: browser JPEG encode -> `findChatPhotoDuplicateAction`
 * pre-check -> PUT through `/api/admin/nina/upload` -> `addChatPhotoAction`.
 *
 * ── WHAT THE ACTION WRITES, CARRIED FORWARD FROM `chatPhotoModel.ts` ────────────────────────
 * Every row this flow creates hangs off a carrier message `addChatPhotoAction` mints
 * (`photoOnly: true`), because "add a photo" is still "add a message with a photo on it" — a NULL
 * `message_id` is the residue of a DELETE, never something a writer asks for, and a photograph the
 * operator adds on purpose has never been in a conversation. The ORPHAN is therefore still a
 * first-class member of the Media folder — every photograph whose conversation was deleted sits
 * here with `messageId: null`, listed and verbable like any other row — but this button never
 * makes one.
 *
 * ── `userId` COMES FROM THE SERVER PROP ─────────────────────────────────────────────────────
 * Threaded `app/admin/nina/page.tsx` -> `FileExplorer` -> here. It builds
 * `adminChatPhotoPathname(userId, id)`, and a user id that reaches a Blob pathname comes from
 * `requireAdmin()`, never from a client-side session read.
 *
 * ── SEQUENTIAL, NOT `Promise.all` ───────────────────────────────────────────────────────────
 * Next 16's Server Actions guide: *"Next.js dispatches Server Actions one at a time per client… do
 * not rely on `Promise.all` to parallelize Server Actions from the client."* So a multi-file pick is
 * a `for` loop, and the loop is honest about it — the `loading` dots are the whole progress display
 * and the per-file failures below are named in full.
 *
 * A per-file failure is not a batch failure: the loop records the message and continues, so one bad
 * frame does not lose the rest. Same rule as `useFolderUpload`'s lanes, one order of magnitude
 * simpler.
 *
 * No confirmation, here either — picking files IS the gesture.
 */
export function MediaAdd({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<readonly string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0 || busy) return

    setBusy(true)
    setErrors([])

    const failures: string[] = []
    for (const [, file] of files.entries()) {
      try {
        const uploaded = await uploadChatPhoto(userId, file, { dedupe: true })
        const result = await addChatPhotoAction(uploaded)
        if (!result.ok) failures.push(`${file.name}: ${result.error ?? 'refused'}`)
      } catch (cause) {
        failures.push(`${file.name}: ${cause instanceof Error ? cause.message : 'upload failed'}`)
      }
    }

    setErrors(failures)
    setBusy(false)
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      {/*
       * Icon, no text — the words live in `aria-label`/`title`, the same rule the album toolbar's
       * icon-only buttons state (`AdminNavLinks.tsx`). The counter text is gone with the old
       * surface; the dots and the failure list carry it.
       */}
      <Button
        type="button"
        size="md"
        variant="secondary"
        aria-label="Add photos"
        title="Add photos"
        loading={busy}
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        <PlusIcon className="size-5" />
      </Button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => void onPick(event)}
      />

      {errors.length > 0 && (
        <ul role="alert" className="text-[12px] font-medium text-red">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
