'use client'

import { useEffect, useRef, useState, useTransition } from 'react'

import { CircleFrame } from '@/components/admin/CircleFrame'
import { CropStudio } from '@/components/admin/CropStudio'
import { BrushIcon, DownloadIcon, EyeIcon, PersonFrameIcon } from '@/components/admin/photoIcons'
import { TOUCH_ICON } from '@/components/admin/touch'
import { Button } from '@/components/ui'
import { useSavePhoto, type SaveNotice } from '@/components/ui/useSavePhoto'
import { setChatPhotoAsAvatarAction } from '@/lib/admin/ninaAlbumActions'
import { cn } from '@/lib/cn'
import { resolveCrop, type NinaCrop } from '@/lib/nina/crop'

import { MediaControls } from './MediaControls'
import { MediaDescription } from './MediaDescription'
import type { ExplorerPhoto, MediaExplorerPhoto } from './model'

/**
 * **One row of the Media folder, in full** — the purged `/admin/photos` rail (`ChatPhotoDetail` +
 * `ChatPhotoProfilePicture`), re-hosted as the explorer's media selection pane. Every verb the old
 * rail had is here, for BOTH kinds of row: the eye (hand-edit what she can see in it), the brush
 * (the generation prompt — see R2 below), the person (adopt as her profile picture, draft framing),
 * download, replace, remove.
 *
 * ── THE FRAMING HALF IS ADOPTION, AND THE DRAFT HAS NOWHERE TO PERSIST ──────────────────────
 * A media row has no crop columns (`nina_message_images` has none — no migration), so there is
 * nothing for a "Save framing" to write to. `CropStudio` + the two sanity circles render with a
 * DRAFT crop that starts at identity and resets to identity, and the draft's ONE consumer is
 * `setChatPhotoAsAvatarAction`, which receives `scale`/`x`/`y` at click time and copies the bytes
 * into a fresh `avatar-` object (`ChatPhotoProfilePicture`'s body, unchanged in mechanism). The
 * `worn` latch disables the button once the action answered `ok` — a live button under a face she
 * already wears would be a lie; a second click would not duplicate anything (the source-key lookup
 * sees to that), but the operator should not have to know that.
 *
 * ── R2: THE PROMPT AFFORDANCE EXISTS ONLY WHILE THE SIDECAR DOES ────────────────────────────
 * The old rail's brush toggle ALWAYS rendered and dimmed on `prompt == null` — the defect the user
 * named: *"kalo user udah replace satu photo, ... hapus tombol untuk ngeliat promptnya"*. Here the
 * toggle is INSIDE the `photo.prompt != null` conditional: a replaced row (`updateNinaChatPhotoBlob`
 * nulls `prompt` in the same statement as the bytes) and a hand-added row (`addChatPhotoAction`
 * writes `prompt: null`) show NO prompt affordance at all — no dim button, no empty block. A
 * never-replaced generated row still does. There is no dim state for prompt and no replaced-flag:
 * the column's NULL is the state.
 *
 * ── ORPHANS ARE FIRST-CLASS MEMBERS, CARRIED FORWARD FROM `chatPhotoModel.ts` ───────────────
 * `messageId` is nullable with `ON DELETE SET NULL`: deleting a chat session orphaned its
 * photographs instead of destroying them, and this folder is where they live now. An orphan has no
 * bubble to caption and no carrier to remove — `removeChatPhotoAction` takes the plain-row branch
 * for it — and nothing here treats `messageId` as "broken". It is displayed nowhere.
 *
 * ── NO OPTIMISTIC COPY, NO CLIENT SESSION ───────────────────────────────────────────────────
 * Every action ends in `revalidatePath('/admin/nina')` and the page is `force-dynamic`, so rows
 * arrive from the server on every render — `SelectionPane`'s docstring's "the one class of bug this
 * screen could plausibly have shipped" stays avoided. `userId` arrives as a prop from the server
 * page (`requireAdmin()`), because it builds a Blob pathname; it is never read from a client
 * session.
 *
 * ── REMOUNTING IS THE RESET ────────────────────────────────────────────────────────────────
 * The dispatcher keys this component by `photo.id` (`SelectionPane`), reproducing the old grid's
 * documented idiom: selecting a different tile remounts the pane — all toggles close, the draft
 * resets, the `worn` latch and the description box's unsaved marker reset with the selection.
 */

/** The pane's own wording for `useSavePhoto`'s two rung-out outcomes — the admin's English. */
const SAVE_NOTICE_TEXT: Record<SaveNotice, string> = {
  opened: 'Opened in a new tab — long-press it to save.',
  unavailable: 'Could not download it. Try again on a steadier connection.',
}

/** The squared icon button every rail control wears — `SelectionPane`'s idiom, spelled once. */
const RAIL_BUTTON = 'w-11 px-0'

/**
 * **Is this explorer row a Media row?** The one narrow over Phase 1's union: `ExplorerPhoto` is
 * `AlbumExplorerPhoto | MediaExplorerPhoto` discriminated by `origin` (`'album'` = an
 * `nina_avatars` row, `'media'` = an original `nina_message_images` row), so a type guard here —
 * not a `boolean` — is what lets the dispatcher's branches reach an arm's own fields with no cast.
 *
 * The single point of contact with Phase 1's model: every other consumer narrows through this
 * guard, so a change to the discriminant's spelling is an edit to this one function.
 */
export function isMediaRow(photo: ExplorerPhoto): photo is MediaExplorerPhoto {
  return photo.origin === 'media'
}

export function MediaPane({
  photo,
  userId,
  onClose,
  onRemoved,
}: {
  photo: MediaExplorerPhoto
  /** From the server prop chain (`requireAdmin()`); `MediaControls` builds a Blob pathname with it. */
  userId: string
  onClose: () => void
  /** Selection is dropped by the owner — the row is gone. Carries the remove action's `note`. */
  onRemoved: (note: string | null) => void
}) {
  /** The adoption draft. `null` means identity — a media row has no stored crop to fall back to. */
  const [draft, setDraft] = useState<NinaCrop | null>(null)
  const [worn, setWorn] = useState(false)
  const [showDescription, setShowDescription] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  /** The download, on `useSavePhoto`'s shared ladder — the album rail's same hook, not a third. */
  const saver = useSavePhoto(photo.url, 'nina')

  /** Keyed remount per selection (`SelectionPane`) resets everything that matters below. */
  const crop = draft ?? resolveCrop(null)
  const natural = { width: photo.width, height: photo.height }

  /**
   * The pane scrolls itself into view when the selection changes — `SelectionPane.tsx`'s effect,
   * for the same reason: below `lg` this `<aside>` sits under a grid of up to 48 tiles, and a pane
   * the operator cannot see is indistinguishable from a broken button. `block: 'nearest'` is a
   * no-op when the element is already fully visible, so desktop is never touched.
   */
  const paneRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    paneRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [photo.id])

  /** Adoption consumes `AdminActionResult`; `MediaControls` consumes `ChatPhotoActionResult`. */
  const onAdopt = () => {
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

  /** The row-toggle look: 44 px of tap target, hover, and a dim state ONLY for the eye below. */
  const rowToggle = (dimmed: boolean) =>
    cn(
      TOUCH_ICON,
      '-my-1 rounded-field hover:bg-paper-2',
      dimmed ? 'text-ink-3 opacity-50' : 'text-ink-2',
    )

  return (
    <aside ref={paneRef} className="rounded-card border border-rule bg-card p-4 lg:p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        {/* The old rail's compact header: the timestamp, rather than Phase 1's derived
            `filename` (date + id) — the pane answers "when", and the grid tile's aria-label already
            answers "which". `pathname` is deliberately not displayed or parsed anywhere. */}
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

      {/* The adoption framing half: same studio, same sanity circles at the sizes the app draws.
          Draft-only — the row keeps no crop columns. */}
      <CropStudio
        src={photo.url}
        natural={natural}
        crop={crop}
        onChange={setDraft}
        disabled={pending || worn}
      />
      <div className="mt-5 flex items-center gap-3">
        <CircleFrame src={photo.url} natural={natural} crop={crop} sizeClass="size-11" />
        <CircleFrame src={photo.url} natural={natural} crop={crop} sizeClass="size-7" />
        <p className="text-[11px] font-medium text-ink-3">
          44 px and 28 px &mdash; the chat header and the typing row, at the sizes they render.
        </p>
      </div>

      <dl className="mt-5 space-y-1 border-t border-rule pt-4 text-[12px] font-medium text-ink-3">
        <div className="flex gap-2">
          <dt>Source</dt>
          <dd className="text-ink-2">
            {photo.kind === 'upload' ? 'His upload, from the chat' : 'Generated in the chat'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>Pixels</dt>
          <dd className="text-ink-2 tabular-nums">
            {photo.width ?? '?'} &times; {photo.height ?? '?'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>Thumbnail</dt>
          <dd className="text-ink-2">None — the grid loads the original</dd>
        </div>
        <div className="flex gap-2">
          <dt>Nina</dt>
          <dd className="text-ink-2">
            {photo.description == null
              ? 'Cannot talk about this photo yet'
              : 'Can talk about this photo'}
          </dd>
        </div>
      </dl>

      {/*
       * THE ONE ICON ROW — the old rail's grammar, in the pane's idiom. Left of the hairline: what
       * the photograph IS to her (the eye; the brush ONLY while a prompt exists — R2). Right of it:
       * what the operator can DO — make it hers, download a copy, replace its bytes, remove it,
       * destructive last. Every control names itself with `aria-label`/`title`; MediaControls's
       * fragment drops Replace and Remove straight into this flex row, and its inline messages wrap
       * beneath (basis-full).
       */}
      <div className="mt-5 flex flex-wrap items-center gap-1 border-t border-rule pt-4">
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

        {/* R2. The conditional IS the feature: no prompt, no button — not a dimmed one. The
            expanded block re-checks, so a selection swap under a reused pane cannot print a stale
            sidecar. */}
        {photo.prompt != null && (
          <button
            type="button"
            onClick={() => setShowPrompt((value) => !value)}
            aria-expanded={showPrompt}
            aria-label="What she was asked to draw"
            title="What she was asked to draw"
            className={rowToggle(false)}
          >
            <BrushIcon className="size-4" />
          </button>
        )}

        <span aria-hidden="true" className="mx-1 h-6 w-px bg-rule" />

        <Button
          size="md"
          className={RAIL_BUTTON}
          loading={pending}
          disabled={pending || worn}
          aria-label={worn ? "She's wearing this one now" : 'Set as her profile picture'}
          title={worn ? "She's wearing this one now" : 'Set as her profile picture'}
          onClick={onAdopt}
        >
          <PersonFrameIcon className="size-4" />
        </Button>

        <Button
          size="md"
          variant="secondary"
          className={RAIL_BUTTON}
          loading={saver.busy}
          aria-label="Download this photo"
          title="Download this photo"
          onPointerDown={saver.warm}
          onFocus={saver.warm}
          onClick={saver.save}
        >
          <DownloadIcon className="size-4" />
        </Button>

        <MediaControls userId={userId} photoId={photo.id} onRemoved={onRemoved} />

        {saver.notice !== null && (
          <p className="basis-full text-[12px] font-medium text-ink-3">
            {SAVE_NOTICE_TEXT[saver.notice]}
          </p>
        )}
        {error !== null && (
          <p role="alert" className="basis-full text-[13px] font-semibold text-warn">
            {error}
          </p>
        )}
      </div>

      {/* THE EXPANDED BLOCKS, in button order — only the asked-for one takes the room. */}
      {showDescription && (
        <div className="mt-3">
          <MediaDescription key={photo.id} photoId={photo.id} description={photo.description} />
        </div>
      )}
      {showPrompt && photo.prompt != null && (
        <p className="mt-3 text-[12px] leading-relaxed font-medium break-words text-ink-2">
          {photo.prompt}
        </p>
      )}
    </aside>
  )
}
