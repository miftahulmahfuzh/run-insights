'use client'

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
 * ── READ-ONLY, THIS PHASE ───────────────────────────────────────────────────────────────────
 * No Server Action import, no `useTransition`, no `Button`. See the SEAM at the bottom.
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
  void userId
  void onRemoved

  return (
    <aside className="rounded-card border border-rule bg-card p-5 lg:sticky lg:top-8">
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
          className="shrink-0 px-1 text-[13px] font-semibold text-ink-3"
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
           * The fallback copy is deliberately about the ROW's state and not about a permanent
           * defect. Reconciled 2026-09-05 against phase 3's D2: after an admin Add or Replace this
           * field is NULL for the few seconds `scheduleChatPhotoDescribe`'s `after()` pass takes,
           * and then fills in on the next load. A sentence reading "she cannot talk about this
           * photo" would be a lie during that window — and would read as a bug for a photograph
           * that is about to be fine. On the send path a null description degrades honestly
           * anyway: `lib/nina/actions.ts:604` substitutes `NINA_DESCRIPTION_UNAVAILABLE`.
           */}
          <p className="text-[12px] leading-relaxed font-medium text-ink-2">
            {photo.description ??
              'Not described yet. She cannot talk about this photo until it is — reload in a moment if it was just added or replaced.'}
          </p>
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
       * SEAM — PHASE 3. The action stack. Empty in phase 2 and the divider above it exists anyway,
       * so filling it moves nothing on screen.
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
       * Phase 3 fills this with a single `<ChatPhotoControls userId={userId} photoId={photo.id}
       * onRemoved={onRemoved} />`, which is what consumes the two `void` statements at the top.
       *
       * No confirmation on any of the three. R1's ruling is a property of this admin surface, not
       * of one page: "i am the only one using this app, no need for all these bullshit
       * confirmation."
       */}
      <div className="mt-4 space-y-2 border-t border-rule pt-4" />
    </aside>
  )
}
