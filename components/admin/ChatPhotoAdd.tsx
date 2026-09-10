'use client'

import { useRef, useState } from 'react'

import { PlusIcon } from '@/components/admin/photoIcons'
import { Button } from '@/components/ui'
import { addChatPhotoAction } from '@/lib/admin/chatPhotoActions'

import { uploadChatPhoto } from './chatPhotoUpload'

/**
 * *"or add a new photo (so it is like nina generated them, but actually it is manually added by
 * user)"*. One control, at the collection level, because the thing being added does not belong to
 * any photograph already there.
 *
 * ── SEQUENTIAL, NOT `Promise.all` ───────────────────────────────────────────────────────────
 * Next 16's Server Actions guide: *"Next.js dispatches Server Actions one at a time per client… do
 * not rely on `Promise.all` to parallelize Server Actions from the client."* So a multi-file pick is
 * a `for` loop, and the loop is honest about it — the counter below is what the operator watches.
 * The uploads are serialized with it, which is fine at this scale: this is "drop the three photos
 * you actually want in her chat", not `/admin/nina`'s three hundred, and that is exactly why this
 * file has no lanes, no queue model and no register-in-chunks machinery.
 *
 * A per-file failure is not a batch failure: the loop records the message and continues, so one bad
 * frame does not lose the rest. Same rule as `useFolderUpload`'s lanes, one order of magnitude
 * simpler.
 *
 * No confirmation, here either — picking files IS the gesture.
 */
export function ChatPhotoAdd({ userId }: { userId: string }) {
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
        const uploaded = await uploadChatPhoto(userId, file)
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
       * R1: icon, no text. The words moved into `aria-label`/`title`, and the sequential loop's
       * honest counter ("Adding 1/3…") went with them — the button's `loading` dots are the whole
       * progress display now, and the per-file failures below are still named in full. The label
       * words survive in the tooltip; they just stopped being layout.
       */}
      <Button
        type="button"
        size="md"
        variant="secondary"
        aria-label="Add a photo"
        title="Add a photo"
        className="w-11 px-0"
        loading={busy}
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        <PlusIcon className="size-4" />
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
        <ul className="text-[12px] font-medium text-red">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
