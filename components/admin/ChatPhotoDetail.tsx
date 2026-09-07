'use client'

import { useEffect, useRef } from 'react'

import { TOUCH_ICON } from '@/components/admin/touch'
import { cn } from '@/lib/cn'

import { ChatPhotoControls } from './ChatPhotoControls'
import { ChatPhotoDescription } from './ChatPhotoDescription'
import type { ChatPhoto } from './chatPhotoModel'

/**
 * One chat photograph, in full — what it is, where it sits in the conversation, and what she was
 * told to draw.
 *
 * ── THE SHAPE IS `SelectionPane`'s, THE CONTENT IS NOT ──────────────────────────────────────
 * Same `<aside>`, same rounded card, same close control, same `<dl>` over a `border-t` divider,
 * same action stack under a second divider. Nothing is imported from
 * `components/admin/explorer/` — the album's rail is about FRAMING a face into a circle
 * (`CropStudio`, two `CircleFrame` sanity checks) and this table has no crop columns and no
 * profile picture to be. The look is shared; the code is not.
 *
 * ── `description` AND `prompt` ARE PRINTED, DELIBERATELY ────────────────────────────────────
 * `SelectionPane.tsx:44-49` prints only whether a description exists. That is the right call for
 * the album. It is the wrong call here, and the plan's invariant 6 says why with precision: the
 * prose is private to Nina's PROMPT, and `/admin` may display it — what is forbidden is it reaching
 * a RUNNER-FACING caption. This page is behind `requireAdmin()` and `robots: { index: false }`, and
 * reading exactly these two fields is why an operator opens this screen: `description` is what
 * `glm-4.6v` says the photograph shows, `prompt` is the sidecar `finishSelfie` recorded. Neither
 * is passed to any surface the runner sees, here or anywhere downstream of here.
 *
 * ── THE RAIL WRITES NOW (PHASE 3) ───────────────────────────────────────────────────────────
 * Everything above still holds. The action stack at the bottom holds `ChatPhotoControls` —
 * Replace and Remove, one click each, no confirmation — and this file still imports no Server
 * Action itself: the controls own that, so a prop rename here cannot reach a mutation.
 *
 * ── AND THE DESCRIPTION IS EDITABLE NOW (R2, `nina-photo-refs-and-bubble-actions`) ────────
 * *"there is a 'what she can see in it' field. make this field editable by user"*. The block under
 * the second divider now mounts `ChatPhotoDescription`, which owns the Server Action. Everything
 * above still holds, including the last sentence of it: this file imports a COMPONENT, not a
 * mutation.
 */

export function ChatPhotoDetail({
  photo,
  userId,
  onClose,
  onRemoved,
}: {
  photo: ChatPhoto
  /**
   * SEAM — PHASE 3. Forwarded from `ChatPhotoGrid`, which got it from the server page. **Unread by
   * this phase** — phase 3's Replace needs it to build `adminChatPhotoPathname(userId, id)`, and a
   * user id destined for a Blob pathname must come from the server rather than from a client-side
   * session read.
   */
  userId: string
  onClose: () => void
  /**
   * Selection has to be dropped by the owner when the row is GONE, which is a different event from
   * closing the rail — `SelectionPane.tsx:57-60`'s exact split.
   *
   * SEAM — PHASE 3. Nothing calls this in phase 2, on purpose: it is wired end to end now so that
   * phase 3's "Remove" is a button and a handler, not a button plus a prop plus a call-site change
   * plus a state lift.
   *
   * **It carries the action's `note`** (`null` when there is nothing to say). Phase 3's remove can
   * answer *"the file is still used elsewhere, so it was kept in the store"*, and this rail is gone
   * from the tree by the time that sentence would render — so the grid holds it. See the seam table.
   */
  onRemoved: (note: string | null) => void
}) {
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
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink">
            {new Date(photo.createdAt).toLocaleString()}
          </p>
          <p className="truncate text-[12px] font-medium text-ink-3" title={photo.pathname}>
            {photo.pathname}
          </p>
        </div>
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

      <dl className="mt-5 space-y-1 border-t border-rule pt-4 text-[12px] font-medium text-ink-3">
        <div className="flex gap-2">
          <dt>Whose</dt>
          {/* `side` is `photoSideOf(kind)`, computed on the server. It reads "hers" for every row
              this page can show; if it ever reads "his", the listing's predicate and the app's
              his/hers discriminator have diverged. */}
          <dd className="text-ink-2">
            {photo.side === 'hers' ? 'Hers' : 'His'} &mdash; {photo.kind}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>Pixels</dt>
          <dd className="text-ink-2 tabular-nums">
            {photo.width ?? '?'} &times; {photo.height ?? '?'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>Size</dt>
          <dd className="text-ink-2 tabular-nums">
            {photo.bytes == null ? 'Unrecorded' : `${Math.round(photo.bytes / 1024)} KB`}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>Message</dt>
          <dd className="truncate text-ink-2" title={photo.messageId}>
            {photo.messageId}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>Position</dt>
          <dd className="text-ink-2 tabular-nums">#{photo.sortOrder} in its bubble</dd>
        </div>
        <div className="flex gap-2">
          <dt>Row</dt>
          <dd className="truncate text-ink-2" title={photo.id}>
            {photo.id}
          </dd>
        </div>
      </dl>

      <div className="mt-4 space-y-3 border-t border-rule pt-4">
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
            What she can see in it
          </p>
          {/*
           * EDITABLE AS OF R2 — *"make this field editable by user"*. The heading stays a `<p>` here
           * and the control labels itself with `aria-label`, which is `MemoryTable.tsx:446`'s call
           * for the same reason: the visible heading lives in the parent, so a `<label htmlFor>`
           * would need an id threaded across a component boundary to say what one attribute says.
           *
           * The fallback copy did NOT disappear. It split — see `ChatPhotoDescription`: the short
           * half is the textarea's placeholder, the honest half about `after()`'s few-second window
           * is a hint line under the field, shown for exactly the same rows it was shown for before.
           * An editable field must not paper over that window and it does not.
           *
           * `key={photo.id}` IS LOAD-BEARING. `ChatPhotoGrid.tsx:240-250` renders this rail UNKEYED,
           * so selecting a different tile re-renders the same instance with different props. Without
           * the key, unsaved text in the box would survive onto another photograph's row and the
           * next Save would write one picture's prose onto another picture. That is data corruption,
           * not a stale render.
           */}
          <ChatPhotoDescription key={photo.id} photoId={photo.id} description={photo.description} />
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
            What she was asked to draw
          </p>
          {/*
           * `prompt` is NULL forever on a photograph the operator added or replaced — there was no
           * generation, so there is no sidecar, and phase 3's D2 nulls it on Replace rather than
           * leaving prose about bytes that are gone. That is honest and it is invisible to the
           * runner: every `kind = 'upload'` row on `main` is already null here. `/admin` is not
           * downstream of invariant 7, so this is not an "admin marker".
           */}
          <p className="text-[12px] leading-relaxed font-medium break-words text-ink-2">
            {photo.prompt ?? 'No sidecar on this row.'}
          </p>
        </div>
      </div>

      {/*
       * THE ACTION STACK — filled by phase 3. The divider above it existed in phase 2 already, so
       * filling it moved nothing on screen.
       *
       * Three controls land here and at the collection header in `ChatPhotoGrid`:
       *   1. Replace  — first in this stack. Needs `photo.id`, `photo.pathname` and `userId`; all
       *      three are props already. It swaps the bytes behind THIS row and keeps the row, its
       *      message, its `created_at` and its place in the conversation.
       *   2. Remove   — last in this stack. Needs `photo.id` and `userId`, and calls
       *      `onRemoved(note)` on success, which is already threaded from the grid.
       *   3. Add      — NOT here. It is a collection-level action and its seam is the header row in
       *      `ChatPhotoGrid`.
       *
       * It is a single `<ChatPhotoControls userId={userId} photoId={photo.id}
       * onRemoved={onRemoved} />`, which is what consumed the two `void` statements phase 2 left
       * at the top of this component.
       *
       * No confirmation on any of the three. R1's ruling is a property of this admin surface, not
       * of one page: "i am the only one using this app, no need for all these bullshit
       * confirmation."
       */}
      <div className="mt-4 space-y-2 border-t border-rule pt-4">
        {/* Phase 3 — R2's "replace" and "remove". One click each, no confirmation. */}
        <ChatPhotoControls userId={userId} photoId={photo.id} onRemoved={onRemoved} />
      </div>
    </aside>
  )
}
