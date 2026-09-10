'use client'

import { useState, useTransition } from 'react'

import { Button } from '@/components/ui'
import { setChatPhotoAsAvatarAction } from '@/lib/admin/ninaAlbumActions'
import { CircleFrame } from '@/components/admin/CircleFrame'
import { CropStudio } from '@/components/admin/CropStudio'
import { isIdentityCrop, resolveCrop, type NinaCrop } from '@/lib/nina/crop'

import type { ChatPhoto } from './chatPhotoModel'

/**
 * **The expanded framing panel** — `CropStudio`, the two sanity circles, and "Set as her profile
 * picture" — for making THIS chat photograph hers. R3 of 2026-09-10, verbatim: *"mengklik tombol
 * ini akan mengexpand framing selection dan Set as her profile picture seperti yang telah kita
 * miliki pada halaman Nina's album"*; R4, the same day, moved the toggle that opens it into the
 * rail's single icon row, where it belongs beside the other four.
 *
 * ── THE FRAMING HALF IS `SelectionPane`'s, RE-HOSTED A THIRD TIME ───────────────────────────
 * Same `CropStudio` (it measures its own frame with a `ResizeObserver`, which is why it survives
 * another move without a line changing), same two `CircleFrame` sanity checks at 44 px and 28 px
 * with the same sentence under them, same primary button going through one action. What is
 * DIFFERENT is deliberate: a chat row has no crop columns, so there is nothing for a "Save
 * framing" to persist to — the crop is draft-only, and its one consumer is the adoption action,
 * which receives `scale`/`x`/`y` at click time. "Reset framing" therefore resets the DRAFT, not a
 * stored value, and identity is where every draft starts.
 *
 * ── THE ACTION COPIES THE BYTES ─────────────────────────────────────────────────────────────
 * `setChatPhotoAsAvatarAction` (in `lib/admin/ninaAlbumActions.ts`, beside the album's own
 * set-current action) copies this photograph into a fresh `avatar-` object and files a
 * `nina_avatars` row for it — so the copy the operator is framing here is not the bytes this rail
 * keeps showing. From the album side the new row is an ordinary photo at the root folder, and her
 * face changes with the same `setCurrentNinaAvatar` the album button has always used: the old row
 * un-currents, `announced_at` re-arms, and she comments on the change (RU-17). Re-adoption is a
 * constraint decision over there (`source_key = 'chat-photo:<id>'`), which is what makes the
 * disabled state below a courtesy and not the only guard.
 *
 * ── `worn` IS A LATCH, NOT A GUESS ──────────────────────────────────────────────────────────
 * Set only on the action's `ok`. A second click would not duplicate anything (the source-key
 * lookup sees to that), but an operator reading a live button under a face she already wears is
 * reading a lie, so the button says what is true instead and stops taking clicks.
 */
export function ChatPhotoProfilePicture({ photo }: { photo: ChatPhoto }) {
  /** The crop being dragged. `null` means identity — a chat row has no stored crop to fall back to. */
  const [draft, setDraft] = useState<NinaCrop | null>(null)
  const [worn, setWorn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const crop = draft ?? resolveCrop(null)
  const dirty = draft != null && !isIdentityCrop(draft)
  const natural = { width: photo.width, height: photo.height }

  const onSet = () => {
    if (pending || worn) return
    setError(null)
    startTransition(async () => {
      const result = await setChatPhotoAsAvatarAction({
        id: photo.id,
        scale: crop.scale,
        x: crop.x,
        y: crop.y,
      })
      if (!result.ok) {
        setError(result.error ?? 'That did not work.')
        return
      }
      setWorn(true)
      setDraft(null)
    })
  }

  return (
    <div>
      <CropStudio
        src={photo.url}
        natural={natural}
        crop={crop}
        onChange={setDraft}
        disabled={pending || worn}
      />

      {/*
       * The honesty check, unchanged from `SelectionPane.tsx`: the sizes the app actually draws,
       * in the same helper — so "it looked right in the tool" and "it looks right in chat" cannot
       * diverge here either.
       */}
      <div className="mt-5 flex items-center gap-3">
        <CircleFrame src={photo.url} natural={natural} crop={crop} sizeClass="size-11" />
        <CircleFrame src={photo.url} natural={natural} crop={crop} sizeClass="size-7" />
        <p className="text-[11px] font-medium text-ink-3">
          44 px and 28 px &mdash; the chat header and the typing row, at the sizes they render.
        </p>
      </div>

      {/*
       * One vertical stack, primary first — `SelectionPane`'s action-list shape. Every button
       * here keeps its words: R1 made the page's CONTROLS icon-only; this panel is the expanded
       * framing half, and the operator named it "seperti ... pada halaman Nina's album", whose
       * buttons have always been labelled.
       */}
      <div className="mt-4 space-y-2">
        <Button size="md" fullWidth loading={pending} disabled={pending || worn} onClick={onSet}>
          {worn ? "She's wearing this one now" : 'Set as her profile picture'}
        </Button>
        <Button
          size="md"
          variant="secondary"
          fullWidth
          disabled={pending || worn || !dirty}
          onClick={() => setDraft(null)}
        >
          Reset framing
        </Button>
      </div>

      {error !== null && (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-warn">
          {error}
        </p>
      )}
    </div>
  )
}
