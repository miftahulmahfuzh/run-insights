'use client'

import { useEffect, useRef, useState } from 'react'

import { BrushIcon, EyeIcon } from '@/components/admin/photoIcons'
import { TOUCH_ICON } from '@/components/admin/touch'
import { cn } from '@/lib/cn'

import { ChatPhotoControls } from './ChatPhotoControls'
import { ChatPhotoDescription } from './ChatPhotoDescription'
import { ChatPhotoProfilePicture } from './ChatPhotoProfilePicture'
import type { ChatPhoto } from './chatPhotoModel'

/**
 * One chat photograph, in full — what it is, where it sits in the conversation, and what she was
 * told to draw. Compact since 2026-09-10 (R2): the file name under the timestamp and the six-row
 * metadata list are GONE — *"buat tampilan lebih compact saat admin klik satu foto"* — and the two
 * prose blocks are collapsed behind icon toggles until asked for.
 *
 * ── THE SHAPE IS `SelectionPane`'s, THE CONTENT IS NOT ──────────────────────────────────────
 * Still the same `<aside>`, rounded card, close control and action stack at the bottom. The album
 * rail is about FRAMING a face into a circle and owns crop columns for it; the framing half now
 * appears HERE too (`ChatPhotoProfilePicture`), but as an ADOPTION: the chat row itself stays
 * cropless, and the draft's one consumer is the set-as-profile-picture action.
 *
 * ── `description` AND `prompt` ARE HIDDEN, NOT GONE ─────────────────────────────────────────
 * They used to print under two uppercase headings; R2's 2b and 2c turn each into ONE ICON BUTTON
 * — an eye and a brush, named for exactly what they open — whose click expands the block that was
 * always here. Nothing about `description`'s editability changed (`ChatPhotoDescription` is the
 * same component it was); the prose is private to Nina's prompt and `/admin` may display it, and
 * now the operator asks for it before it takes the room.
 *
 * Both toggles DIM when their block has nothing to say — `description == null` (not described
 * yet, or just replaced, while `after()`'s pass runs) and `prompt == null` (a row the operator
 * added or replaced has no generation sidecar). Dimmed is not disabled: an empty block that opens
 * is honest about being empty, and the editor inside the eye is how a missing description gets
 * written by hand.
 *
 * ── REMOUNTING IS THE RESET ─────────────────────────────────────────────────────────────────
 * `ChatPhotoGrid` keys this rail by `photo.id`, so selecting a different tile remounts the whole
 * aside — both toggles close, and the unsaved-draft protection stays where it was: inside the
 * keyed `ChatPhotoDescription` (whose `key` is now redundant but keeps its own argument).
 */

export function ChatPhotoDetail({
  photo,
  userId,
  onClose,
  onRemoved,
}: {
  photo: ChatPhoto
  /**
   * Forwarded from `ChatPhotoGrid`, which got it from the server page. Used by `ChatPhotoControls`
   * to build `adminChatPhotoPathname(userId, id)` — a user id destined for a Blob pathname comes
   * from the server rather than from a client-side session read.
   */
  userId: string
  onClose: () => void
  /**
   * Selection has to be dropped by the owner when the row is GONE, which is a different event from
   * closing the rail — `SelectionPane.tsx:57-60`'s exact split. It carries the remove action's
   * `note` (`null` when there is none), which the grid holds because this rail unmounts before the
   * sentence could be read.
   */
  onRemoved: (note: string | null) => void
}) {
  /** 2b and 2c: collapsed until clicked, and reset by the grid's `key` on selection change. */
  const [showDescription, setShowDescription] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)

  /**
   * The rail scrolls itself into view when the selection changes — `SelectionPane.tsx`'s effect,
   * for the same reason and with the same guarantee. Below `lg` this `<aside>` sits under a grid
   * of up to 48 tiles, so tapping one near the bottom opens a pane the operator cannot see.
   * `block: 'nearest'` makes it a no-op at `lg`, where the rail is already beside the grid and
   * `lg:sticky lg:top-8` keeps it there.
   */
  const paneRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    paneRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [photo.id])

  return (
    <aside
      ref={paneRef}
      className="rounded-card border border-rule bg-card p-4 lg:sticky lg:top-8 lg:p-5"
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        {/* 2a: the long file name that used to sit under the timestamp is deliberately gone. */}
        <p className="truncate text-[15px] font-semibold text-ink">
          {new Date(photo.createdAt).toLocaleString()}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the details pane"
          className={cn(TOUCH_ICON, '-mt-2 -mr-2 shrink-0 text-[15px] font-semibold text-ink-3')}
        >
          &times;
        </button>
      </div>

      <div className="overflow-hidden rounded-field bg-paper-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted and deliberately
            un-transformed; the same call `components/nina/NinaPhotoGrid.tsx:56-58` recorded. */}
        <img
          src={photo.url}
          alt=""
          loading="lazy"
          decoding="async"
          className="block max-h-[320px] w-full object-contain"
        />
      </div>

      {/*
       * THE TWO PROSE TOGGLES (2b, 2c). One icon each — the eye opens what she sees in the
       * photograph, the brush opens what she was asked to draw — and the block each opens is the
       * block this rail always had. An icon-only control names itself with `aria-label`, which is
       * `MemoryTable.tsx:446`'s call: the name lives on the button, so no id threading is needed.
       */}
      <div className="mt-4 space-y-3 border-t border-rule pt-3">
        <div>
          <button
            type="button"
            onClick={() => setShowDescription((value) => !value)}
            aria-expanded={showDescription}
            aria-label="What she can see in it"
            title="What she can see in it"
            className={cn(
              TOUCH_ICON,
              '-my-1 -ml-2 rounded-field hover:bg-paper-2',
              photo.description == null ? 'text-ink-3 opacity-50' : 'text-ink-2',
            )}
          >
            <EyeIcon className="size-4" />
          </button>
          {showDescription && (
            <div className="mt-2">
              <ChatPhotoDescription
                key={photo.id}
                photoId={photo.id}
                description={photo.description}
              />
            </div>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowPrompt((value) => !value)}
            aria-expanded={showPrompt}
            aria-label="What she was asked to draw"
            title="What she was asked to draw"
            className={cn(
              TOUCH_ICON,
              '-my-1 -ml-2 rounded-field hover:bg-paper-2',
              photo.prompt == null ? 'text-ink-3 opacity-50' : 'text-ink-2',
            )}
          >
            <BrushIcon className="size-4" />
          </button>
          {showPrompt && (
            <p className="mt-2 text-[12px] leading-relaxed font-medium break-words text-ink-2">
              {photo.prompt ?? 'No sidecar on this row.'}
            </p>
          )}
        </div>
      </div>

      {/*
       * THE ACTION STACK. R3 put the profile-picture icon HERE, above Replace and Remove, and its
       * expanded framing panel (CropStudio, the two sanity circles, set-as-profile-picture) is
       * `ChatPhotoProfilePicture`'s whole business — this rail only hosts it, exactly as it hosts
       * the description editor without owning its action.
       *
       * No confirmation on any of the three below-the-fold actions, as ever on this surface: R1's
       * ruling is a property of this admin page, not of one button — "i am the only one using this
       * app, no need for all these bullshit confirmation."
       */}
      <div className="mt-4 space-y-3 border-t border-rule pt-4">
        <ChatPhotoProfilePicture photo={photo} />
        <ChatPhotoControls userId={userId} photoId={photo.id} onRemoved={onRemoved} />
      </div>
    </aside>
  )
}
