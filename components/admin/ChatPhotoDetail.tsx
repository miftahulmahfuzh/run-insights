'use client'

import { useEffect, useRef, useState } from 'react'

import { BrushIcon, EyeIcon, PersonFrameIcon } from '@/components/admin/photoIcons'
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
 * prose blocks are collapsed behind icon toggles until asked for. R4, the same day: *"buat semua
 * icon itu dalam SATU ROW saja … i prefer compact and simple UI"* — so the eye, the brush, the
 * profile-picture toggle and Replace/Remove now share ONE row, with a hairline between the two
 * "see what it is" toggles and the three "do something" controls.
 *
 * ── THE SHAPE IS `SelectionPane`'s, THE CONTENT IS NOT ──────────────────────────────────────
 * Still the same `<aside>`, rounded card, close control and action controls at the bottom. The
 * album rail is about FRAMING a face into a circle and owns crop columns for it; the framing half
 * now appears HERE too (`ChatPhotoProfilePicture`), but as an ADOPTION: the chat row itself stays
 * cropless, and the draft's one consumer is the set-as-profile-picture action.
 *
 * ── `description` AND `prompt` ARE HIDDEN, NOT GONE ─────────────────────────────────────────
 * The eye and the brush open the blocks that were always here — `ChatPhotoDescription` is the
 * same editable component it was; the prompt paragraph is the same read-only one. Each toggle
 * DIMS when its block has nothing to say — `description == null` (not described yet, or just
 * replaced, while `after()`'s pass runs) and `prompt == null` (a row the operator added or
 * replaced has no generation sidecar). Dimmed is not disabled: an empty block that opens is
 * honest about being empty, and the editor inside the eye is how a missing description gets
 * written by hand.
 *
 * ── WHO OWNS WHICH BUTTON ───────────────────────────────────────────────────────────────────
 * All five buttons render in this row, but only three belong to this file: the eye, the brush and
 * the person are pure toggles over this component's three booleans, and their blocks mount below
 * the row in the same order. Replace and Remove stay `ChatPhotoControls`' — its fragment drops
 * the two buttons straight into this flex row and its inline messages wrap beneath them — and
 * the framing panel stays `ChatPhotoProfilePicture`'s whole body. This rail hosts; it does not
 * own their state.
 *
 * ── REMOUNTING IS THE RESET ─────────────────────────────────────────────────────────────────
 * `ChatPhotoGrid` keys this rail by `photo.id`, so selecting a different tile remounts the whole
 * aside — all three toggles close, and the unsaved-draft protection stays where it was: inside
 * the keyed `ChatPhotoDescription` (whose `key` is now redundant but keeps its own argument).
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
  /** R4: collapsed until clicked, and reset by the grid's `key` on selection change. */
  const [showDescription, setShowDescription] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

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

  /** The row-toggle look, spelled once: 44 px of tap target, hover, and a dim state when empty. */
  const rowToggle = (dimmed: boolean) =>
    cn(
      TOUCH_ICON,
      '-my-1 rounded-field hover:bg-paper-2',
      dimmed ? 'text-ink-3 opacity-50' : 'text-ink-2',
    )

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
       * THE ONE ICON ROW (R4). Left of the hairline: what the photograph IS to her — what she can
       * see in it, what she was asked to draw. Right of it: what the operator can DO — make it her
       * profile picture, replace its bytes, remove it. Every control names itself with
       * `aria-label` (`MemoryTable.tsx:446`'s call: the name lives on the button), and an
       * icon-only toggle says whether it is open with `aria-expanded`.
       */}
      <div className="mt-4 border-t border-rule pt-3">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setShowDescription((value) => !value)}
            aria-expanded={showDescription}
            aria-label="What she can see in it"
            title="What she can see in it"
            className={cn(rowToggle(photo.description == null), '-ml-2')}
          >
            <EyeIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowPrompt((value) => !value)}
            aria-expanded={showPrompt}
            aria-label="What she was asked to draw"
            title="What she was asked to draw"
            className={rowToggle(photo.prompt == null)}
          >
            <BrushIcon className="size-4" />
          </button>

          <span aria-hidden="true" className="mx-1 h-6 w-px bg-rule" />

          <button
            type="button"
            onClick={() => setShowProfile((value) => !value)}
            aria-expanded={showProfile}
            aria-label="Set as her profile picture"
            title="Set as her profile picture"
            className={rowToggle(false)}
          >
            <PersonFrameIcon className="size-4" />
          </button>

          {/* Its fragment drops Replace and Remove straight into this row; its error/note lines
              wrap below the icons (basis-full) rather than beside them. */}
          <ChatPhotoControls userId={userId} photoId={photo.id} onRemoved={onRemoved} />
        </div>

        {/*
         * THE EXPANDED BLOCKS, in button order. Only the asked-for one takes the room — which is
         * the whole point of R2's collapse and R4's single row.
         */}
        {showDescription && (
          <div className="mt-3">
            <ChatPhotoDescription
              key={photo.id}
              photoId={photo.id}
              description={photo.description}
            />
          </div>
        )}
        {showPrompt && (
          <p className="mt-3 text-[12px] leading-relaxed font-medium break-words text-ink-2">
            {photo.prompt ?? 'No sidecar on this row.'}
          </p>
        )}
        {showProfile && (
          <div className="mt-3">
            <ChatPhotoProfilePicture photo={photo} />
          </div>
        )}
      </div>
    </aside>
  )
}
