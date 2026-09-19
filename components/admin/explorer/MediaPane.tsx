'use client'

import { useEffect, useRef, useState, useTransition } from 'react'

import { CircleFrame } from '@/components/admin/CircleFrame'
import { CropStudio } from '@/components/admin/CropStudio'
import {
  AnchorIcon,
  BrushIcon,
  DownloadIcon,
  PersonFrameIcon,
  SquarePenIcon,
} from '@/components/admin/photoIcons'
import { TOUCH_ICON } from '@/components/admin/touch'
import { Button, ButtonLink } from '@/components/ui'
import { useSavePhoto, type SaveNotice } from '@/components/ui/useSavePhoto'
import {
  describeChatPhotoAction,
  editChatPhotoDescriptionAction,
} from '@/lib/admin/chatPhotoActions'
import {
  editNinaMessageImageNegativeSearchKeywordsAction,
  editNinaMessageImageSearchKeywordsAction,
} from '@/lib/admin/chatPhotoKeywordActions'
import { setNinaImageReferenceAction } from '@/lib/admin/imageReferenceActions'
import { setChatPhotoAsAvatarAction } from '@/lib/admin/ninaAlbumActions'
import { cn } from '@/lib/cn'
import { resolveCrop, type NinaCrop } from '@/lib/nina/crop'

import { MediaControls } from './MediaControls'
import { PhotoDescription } from './PhotoDescription'
import type { ExplorerPhoto, MediaExplorerPhoto } from './model'

/**
 * **One row of the Media folder, in full** — the purged `/admin/photos` rail (`ChatPhotoDetail` +
 * `ChatPhotoProfilePicture`), re-hosted as the explorer's media selection pane. Every verb the old
 * rail had is here, for BOTH kinds of row: the brush (the generation prompt — see R2 below), the
 * person (adopt as her profile picture, draft framing), the anchor (set as the image-generation
 * reference — 2026-09-19, unconditional on `kind` since a runner's upload is as valid a reference
 * as one of her generations, see `referenceEligibleChatPhotoScope`), download, replace, remove —
 * and the describe story lives in the `PhotoDescription` section below the icon row (R3's unified
 * panel; the old eye toggle retired with the seam it fed).
 *
 * ── THE FRAMING HALF IS ADOPTION, AND THE DRAFT HAS NOWHERE TO PERSIST ──────────────────────
 * A media row has no crop columns (`nina_message_images` has none — and
 * media-album-unified-search Phase 1 added keyword and embedding columns to this table, not crop
 * ones), so there is nothing for a "Save framing" to write to. `CropStudio` + the two sanity
 * circles render with a DRAFT crop that starts at identity and resets to identity, and the draft's
 * ONE consumer is `setChatPhotoAsAvatarAction`, which receives `scale`/`x`/`y` at click time.
 *
 * What that action does with them changed on 2026-09-17 (R3): it no longer fetches these bytes and
 * `put()`s a second Blob object. It mints an `nina_avatars` row that POINTS at this one — same
 * bytes, one object, and the album row stores the crop while this row stores the photograph. The
 * pane is unchanged by that: the draft it hands over is the same three numbers, and the album row
 * is still the only side that can keep them.
 *
 * The `worn` latch disables the button once the action answered `ok` — a live button under a face
 * she already wears would be a lie; a second click would not duplicate anything (the source-key
 * lookup sees to that), but the operator should not have to know that.
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
  const [showPrompt, setShowPrompt] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  /** "Set as image-generation anchor" — its own note, `AlbumSelectionPane`'s convention. */
  const [anchorNote, setAnchorNote] = useState<string | null>(null)

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

  const onSetAnchor = () => {
    if (pending) return
    setError(null)
    startTransition(async () => {
      const result = await setNinaImageReferenceAction({ source: 'chat', id: photo.id })
      if (!result.ok) {
        setError(result.error ?? 'That did not work.')
        return
      }
      setAnchorNote('Set as the image-generation anchor.')
    })
  }

  /** The row-toggle look: 44 px of tap target and hover. (The eye's dim retired with the eye.) */
  const rowToggle = () => cn(TOUCH_ICON, '-my-1 rounded-field hover:bg-paper-2', 'text-ink-2')

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
      </dl>

      {/*
       * THE ONE ICON ROW — the old rail's grammar, in the pane's idiom. Left of the hairline: what
       * the photograph IS to her (the brush ONLY while a prompt exists — R2; the describe story
       * lives in the panel section below). Right of it: what the operator can DO — make it hers,
       * anchor image generation to it, download a copy, open it in Photoshop, replace its bytes,
       * remove it, destructive last. The
       * Photoshop button is a plain `ButtonLink` to `/admin/photoshop/message_image/[id]`, the same
       * route `PhotoshopPickerGrid` links to — pure navigation, nothing to await. Every control
       * names itself with `aria-label`/`title`; MediaControls's fragment drops Replace and Remove
       * straight into this flex row, and its inline messages wrap beneath (basis-full).
       */}
      <div className="mt-5 flex flex-wrap items-center gap-1 border-t border-rule pt-4">
        {/* R2. The conditional IS the feature: no prompt, no button — not a dimmed one. The
            expanded block re-checks, so a selection swap under a reused pane cannot print a stale
            sidecar. */}
        {photo.prompt != null && (
          <>
            <button
              type="button"
              onClick={() => setShowPrompt((value) => !value)}
              aria-expanded={showPrompt}
              aria-label="What she was asked to draw"
              title="What she was asked to draw"
              className={cn(rowToggle(), '-ml-2')}
            >
              <BrushIcon className="size-4" />
            </button>

            <span aria-hidden="true" className="mx-1 h-6 w-px bg-rule" />
          </>
        )}

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
          loading={pending}
          disabled={pending}
          aria-label="Set as image-generation anchor"
          title="Set as image-generation anchor"
          onClick={onSetAnchor}
        >
          <AnchorIcon className="size-4" />
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

        <ButtonLink
          href={`/admin/photoshop/message_image/${photo.id}`}
          size="md"
          variant="secondary"
          className={RAIL_BUTTON}
          aria-label="Open in Photoshop"
          title="Open in Photoshop"
        >
          <SquarePenIcon className="size-4" />
        </ButtonLink>

        <MediaControls userId={userId} photoId={photo.id} onRemoved={onRemoved} />

        {saver.notice !== null && (
          <p role="status" className="basis-full text-[12px] font-medium text-ink-3">
            {SAVE_NOTICE_TEXT[saver.notice]}
          </p>
        )}
        {anchorNote !== null && (
          <p role="status" className="basis-full text-[12px] font-medium text-ink-3">
            {anchorNote}
          </p>
        )}
        {error !== null && (
          <p role="alert" className="basis-full text-[13px] font-semibold text-warn">
            {error}
          </p>
        )}
      </div>

      {/* THE EXPANDED BLOCKS, in button order — only the asked-for one takes the room. */}
      {showPrompt && photo.prompt != null && (
        <p className="mt-3 text-[12px] leading-relaxed font-medium break-words text-ink-2">
          {photo.prompt}
        </p>
      )}

      {/*
       * THE DESCRIBE SECTION (R3) — the media arm's twin of `AlbumSelectionPane`'s mount. Same
       * component, same section, this table's actions; after an Add or Replace the `after()` pass
       * fills the field in moments, which is what the empty note promises.
       *
       * ── THE KEYWORD BOXES ARE NEW HERE, AND THAT IS THE WHOLE OF R2's UI ──────────────────
       * media-album-unified-search R2, 2026-09-17, in the user's words: *"every single picture in
       * any directory must be able to be image searched and we must be able to add search keyword
       * and negative search keyword to each of them."* Until Phase 1 this table had no such
       * columns, so this mount passed neither prop and `PhotoDescription` rendered neither block —
       * absent, not disabled. It has them now, so the props travel, and the shape of the wiring is
       * `AlbumSelectionPane`'s verbatim (`SelectionPane.tsx`): the value prop and its save closure
       * are handed in together, and the closure names THIS table's action so a rename in either
       * action family fails at this call site rather than inside a component that guessed.
       */}
      <PhotoDescription
        description={photo.description}
        emptyNote="She cannot talk about this photo until it is described — reload in a moment if it was just added or replaced, or write it yourself."
        onSave={(text) => editChatPhotoDescriptionAction({ id: photo.id, description: text })}
        onRedescribe={() => describeChatPhotoAction({ id: photo.id })}
        searchKeywords={photo.searchKeywords}
        onSaveKeywords={(text) =>
          editNinaMessageImageSearchKeywordsAction({ id: photo.id, searchKeywords: text })
        }
        negativeSearchKeywords={photo.negativeSearchKeywords}
        onSaveNegativeKeywords={(text) =>
          editNinaMessageImageNegativeSearchKeywordsAction({
            id: photo.id,
            negativeSearchKeywords: text,
          })
        }
      />
    </aside>
  )
}
