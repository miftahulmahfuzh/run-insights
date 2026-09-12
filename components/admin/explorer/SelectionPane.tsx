'use client'

import { useEffect, useRef, useState, useTransition } from 'react'

import { CircleFrame } from '@/components/admin/CircleFrame'
import { CropStudio } from '@/components/admin/CropStudio'
import {
  CheckIcon,
  DownloadIcon,
  PersonFrameIcon,
  RotateCcwIcon,
  TrashIcon,
} from '@/components/admin/photoIcons'
import { ShareToNinaItem } from '@/components/admin/ShareToNinaItem'
import { TOUCH_ICON } from '@/components/admin/touch'
import { Button } from '@/components/ui'
import { useSavePhoto, type SaveNotice } from '@/components/ui/useSavePhoto'
import {
  deleteNinaAvatarAction,
  describeNinaAvatarAction,
  editNinaAvatarDescriptionAction,
  saveNinaAvatarCropAction,
  setCurrentNinaAvatarAction,
} from '@/lib/admin/ninaAlbumActions'
import { folderBreadcrumbs } from '@/lib/admin/filetree'
import { cn } from '@/lib/cn'
import { isIdentityCrop, resolveCrop, type NinaCrop } from '@/lib/nina/crop'

import { isMediaRow, MediaPane } from './MediaPane'
import { PhotoDescription } from './PhotoDescription'
import type { AlbumExplorerPhoto, ExplorerPhoto } from './model'

/**
 * The details rail: what this file is, how her face sits in the circle, and what can be done to it.
 *
 * ── THE FRAMING HALF IS `AlbumManager.tsx:84-192`, MOVED, NOT REWRITTEN ─────────────────────
 * Same `draft` / `stored` / `dirty` triple, same `run()` transition helper, same two sanity
 * circles at 44 px and 28 px with the same sentence under them. F33 landed framing and it is
 * correct; this phase re-hosts it and does not re-litigate it. `CropStudio` and `CircleFrame` are
 * imported unmodified — `CropStudio` measures its own frame with a `ResizeObserver`
 * (`CropStudio.tsx:70-78`), which is exactly why it survives the move from a 460 px column into a
 * 320 px rail without a line changing.
 *
 * ── R6, 2026-09-10: ONE ICON ROW, NO TEXT ───────────────────────────────────────────────────
 * *"ubah semua tombol disini menjadi icon tanpa text … kalau tombol tombolnya bisa dijejerin dalam
 * satu row, maka jejerkan mereka dalam satu row saja."* The framing pair and the four-step action
 * stack therefore collapsed into ONE `flex-wrap` rail — the same shape R4 gave `/admin/photos`'s
 * detail pane the same day, with the same grammar: framing's own two verbs left of the hairline,
 * what can be DONE to the photograph right of it, destructive last. Every control names itself
 * with `aria-label`/`title` (`MemoryTable.tsx:446`'s call: the name lives on the button); the
 * squared `w-11 px-0` `Button` is `ChatPhotoControls`' idiom, so `loading` still swaps a glyph for
 * pulsing dots inside an unchanged box. `flex-wrap` is the honesty about the 320 px `lg` rail: a
 * 44 px-target row of seven cannot fit under 280 px of width, and the row is the user's "kalau
 * bisa" made literal — one row wherever the width allows, two where it cannot.
 *
 * ── WHAT IS NEW IS ONE BUTTON ───────────────────────────────────────────────────────────────
 * The download. It is `useSavePhoto`'s ladder — the same share/download/open machinery the chat
 * viewer and `/nina/about`'s strip use, warmed on `pointerdown` — not a third save implementation.
 * Its notices are worded here, in the admin's own English, because the ladder's words belong to
 * the surface (`SAVE_NOTICE_TEXT`'s Indonesian is the runner-facing twin).
 *
 * ── NO OPTIMISTIC COPY OF THE ALBUM ─────────────────────────────────────────────────────────
 * `AlbumManager`'s docstring called this out as *"the one class of bug this screen could plausibly
 * have shipped"*, and it still applies: every action calls `revalidatePath('/admin/nina')`, the
 * page is `force-dynamic`, so the photos arrive from the server on every render and there is
 * nothing here to keep in sync.
 *
 * ── `description` IS RENDERED HERE — AND NOWHERE RUNNER-FACING ─────────────────────────────
 * R3 (2026-09-10): the describe result is exactly the thing this rail exists to show and correct,
 * so `PhotoDescription` below renders and edits the stored prose for BOTH arms — the album's here,
 * the Media arm's in `MediaPane.tsx`, same component. That is an ADMIN-surface change only, and
 * invariant 5 is untouched by construction: the description's one runner-facing path is still the
 * text block `userTurnText` renders (`lib/nina/turn.ts:577-586`), `glm-5.3` is still never sent an
 * image part, and no runner component gained a reader. The old null-ness row ("Cannot talk about
 * this photo yet") is gone from both arms — the panel's empty state and its auto-describe note say
 * the same thing where the operator can act on it.
 *
 * ── TWO KINDS OF ROW, ONE PANE MOUNT ────────────────────────────────────────────────────────
 * Since the image-collection merge this mount serves the album's rows AND the Media view's rows.
 * The exported `SelectionPane` is a two-line dispatcher: an album row keeps everything below,
 * byte for byte; a media row renders `MediaPane`, whose verbs are the conversation photograph's
 * (replace, remove, adopt-with-draft, download, hand-edit description, prompt view). The split is
 * Phase 2's D-P2-4: the album rail's framing semantics (a STORED crop, Save/Reset) and the media
 * rail's (a DRAFT crop, adopt) share a studio but not a contract, and one branching component
 * would have threaded `photo.kind` through every line of both.
 */

/** The rail's own wording for `useSavePhoto`'s two rung-out outcomes. */
const SAVE_NOTICE_TEXT: Record<SaveNotice, string> = {
  opened: 'Opened in a new tab — long-press it to save.',
  unavailable: 'Could not download it. Try again on a steadier connection.',
}

/** The squared icon button every rail control wears, spelled once. */
const RAIL_BUTTON = 'w-11 px-0'

export function SelectionPane({
  photo,
  userId,
  shareOrigin,
  onClose,
  onRemoved,
}: {
  photo: ExplorerPhoto
  /** From the server page (`requireAdmin()`). `MediaPane` builds a Blob pathname with it. */
  userId: string
  /** `shareOrigin()`'s output, threaded from the page. Never `window.location`. Phase 7 / R2. */
  shareOrigin: string
  onClose: () => void
  /**
   * Selection has to be dropped by the owner — the row is gone. Carries the remove action's `note`
   * (`null` for an album remove), which `FileExplorer` holds because this pane unmounts before the
   * sentence could be read.
   */
  onRemoved: (note: string | null) => void
}) {
  if (isMediaRow(photo)) {
    return (
      <MediaPane
        key={photo.id}
        photo={photo}
        userId={userId}
        onClose={onClose}
        onRemoved={onRemoved}
      />
    )
  }
  return (
    <AlbumSelectionPane
      photo={photo}
      shareOrigin={shareOrigin}
      onClose={onClose}
      onRemoved={() => onRemoved(null)}
    />
  )
}

function AlbumSelectionPane({
  photo,
  shareOrigin,
  onClose,
  onRemoved,
}: {
  photo: AlbumExplorerPhoto
  /** `shareOrigin()`'s output, threaded from the page. Never `window.location`. Phase 7 / R2. */
  shareOrigin: string
  onClose: () => void
  /** Selection has to be dropped by the owner — the row is gone. */
  onRemoved: () => void
}) {
  /** The crop being dragged. `null` means "the stored one", which is what Reset restores to. */
  const [draft, setDraft] = useState<NinaCrop | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  /** The download's own flight, independent of the server actions' shared `pending`. */
  const saver = useSavePhoto(photo.url, 'nina')

  const stored = resolveCrop(photo.crop)
  const crop = draft ?? stored
  const dirty =
    draft != null && (draft.scale !== stored.scale || draft.x !== stored.x || draft.y !== stored.y)

  function run(action: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null)
    startTransition(async () => {
      const outcome = await action()
      if (!outcome.ok) {
        setError(outcome.error ?? 'That did not work.')
        return
      }
      onOk?.()
    })
  }

  /**
   * The rail scrolls itself into view when the selection changes.
   *
   * Below `lg` this `<aside>` is the third block of a single column, under a grid of up to 120
   * tiles. Tapping a photograph near the bottom of that grid opens a pane a screen and a half
   * further down, and the screen does not move — which is indistinguishable from a broken button.
   *
   * `block: 'nearest'` is why this can run unconditionally instead of behind a breakpoint check:
   * at `lg` the pane is already beside the grid and fully visible, and `nearest` on a fully
   * visible element scrolls nothing. So there is no media query to observe and the desktop scroll
   * position is never touched.
   *
   * Keyed on `photo.id`, not on mount. The rail is REUSED when the selection moves from one
   * photograph to another — `FileExplorer` renders one `SelectionPane` and swaps its `photo` —
   * so the second selection deserves the same courtesy as the first.
   */
  const paneRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    paneRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [photo.id])

  /* `folderBreadcrumbs` (phase 2's name; the draft assumed `breadcrumbFor`) returns crumbs of
   * `{ path, name, depth, isCurrent }` — so the label is `name`, and the root's own name is
   * `NINA_FOLDER_ROOT_LABEL`, which is why "Album" needs no special case here. */
  const trail = folderBreadcrumbs(photo.folder)
    .map((crumb) => crumb.name)
    .join(' / ')

  return (
    <aside ref={paneRef} className="rounded-card border border-rule bg-card p-4 lg:p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-ink" title={photo.filename}>
            {photo.filename}
          </p>
          <p className="truncate text-[12px] font-medium text-ink-3" title={trail}>
            {trail}
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

      <CropStudio
        src={photo.url}
        natural={{ width: photo.width, height: photo.height }}
        crop={crop}
        onChange={setDraft}
        disabled={pending}
      />

      {/* The honesty check, unchanged from `AlbumManager.tsx:134-152`. Same helper, same square
          box, the sizes the app actually draws — so "it looked right in the tool" and "it looks
          right in chat" cannot diverge. */}
      <div className="mt-5 flex items-center gap-3">
        <CircleFrame
          src={photo.url}
          natural={{ width: photo.width, height: photo.height }}
          crop={dirty ? crop : photo.crop}
          sizeClass="size-11"
        />
        <CircleFrame
          src={photo.url}
          natural={{ width: photo.width, height: photo.height }}
          crop={dirty ? crop : photo.crop}
          sizeClass="size-7"
        />
        <p className="text-[11px] font-medium text-ink-3">
          44 px and 28 px — the chat header and the typing row, at the sizes they render.
        </p>
      </div>

      <dl className="mt-5 space-y-1 border-t border-rule pt-4 text-[12px] font-medium text-ink-3">
        <div className="flex gap-2">
          <dt>Source</dt>
          <dd className="text-ink-2">{photo.source}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Pixels</dt>
          <dd className="text-ink-2 tabular-nums">
            {photo.width ?? '?'} &times; {photo.height ?? '?'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt>Thumbnail</dt>
          <dd className="text-ink-2">
            {photo.thumbUrl == null ? 'None — the grid loads the original' : 'Derived'}
          </dd>
        </div>
      </dl>

      {/*
       * THE ONE ICON ROW (R6). Left of the hairline: the crop's own two verbs — save the drag,
       * reset to the original. Right of it: what can be DONE to the photograph, in the grammar
       * `/admin/photos`' rail already established — make it hers, send it to her chat, take a copy
       * of it, and destructive LAST. The describe verb is NOT in this row any more — R3 moved it
       * into the labelled `PhotoDescription` section below, next to the prose it rewrites.
       * Every control names itself with `aria-label` and `title`; the words survive nowhere as
       * children of a button.
       *
       * SEAM — PHASE 7. The share control needs `shareOrigin()` as a prop, because
       * `lib/share/origin.ts:1` is `server-only` and invariant 9 forbids a `NEXT_PUBLIC_` for it:
       * it is threaded `app/admin/nina/page.tsx` -> `FileExplorer` -> here, and consumed inside
       * `ShareToNinaItem`.
       *
       * The leading `*` on every line is load-bearing, not cosmetic: `ci:client-secret-guard`'s
       * Rule 3 forbids the string above anywhere in `app/`, `lib/` or `components/`, and its
       * comment exemption (`scripts/check-client-secret-boundary.mjs`'s `isComment`) recognises
       * `//`, `/*` and `*` — so a JSX comment whose continuation lines are bare prose fails the
       * guard while quoting the rule it is obeying.
       */}
      <div className="mt-5 flex flex-wrap items-center gap-1 border-t border-rule pt-4">
        <Button
          size="md"
          className={RAIL_BUTTON}
          loading={pending}
          disabled={!dirty || pending}
          aria-label={dirty ? 'Save framing' : 'Framing saved'}
          title={dirty ? 'Save framing' : 'Framing saved'}
          onClick={() =>
            run(
              () =>
                saveNinaAvatarCropAction({
                  id: photo.id,
                  scale: crop.scale,
                  x: crop.x,
                  y: crop.y,
                }),
              () => setDraft(null),
            )
          }
        >
          <CheckIcon className="size-4" />
        </Button>
        <Button
          size="md"
          variant="secondary"
          className={RAIL_BUTTON}
          disabled={pending || (isIdentityCrop(crop) && !dirty)}
          aria-label="Reset framing"
          title="Reset framing"
          onClick={() =>
            run(
              () => saveNinaAvatarCropAction({ id: photo.id, scale: 1, x: 0, y: 0 }),
              () => setDraft(null),
            )
          }
        >
          <RotateCcwIcon className="size-4" />
        </Button>

        <span aria-hidden="true" className="mx-1 h-6 w-px bg-rule" />

        <Button
          size="md"
          className={RAIL_BUTTON}
          loading={pending}
          disabled={pending || photo.isCurrent}
          aria-label={photo.isCurrent ? 'Her profile picture' : 'Set as her profile picture'}
          title={photo.isCurrent ? 'Her profile picture' : 'Set as her profile picture'}
          onClick={() => run(() => setCurrentNinaAvatarAction(photo.id))}
        >
          <PersonFrameIcon className="size-4" />
        </Button>

        <ShareToNinaItem
          photoId={photo.id}
          described={photo.description != null}
          shareOrigin={shareOrigin}
        />

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

        <Button
          size="md"
          variant="destructive"
          className={RAIL_BUTTON}
          disabled={pending || photo.isCurrent}
          title={
            photo.isCurrent
              ? 'Make another photo hers first — she is never left without one.'
              : undefined
          }
          aria-label="Remove this photo"
          onClick={() => run(() => deleteNinaAvatarAction(photo.id), onRemoved)}
        >
          <TrashIcon className="size-4" />
        </Button>

        {saver.notice !== null && (
          <p role="status" className="basis-full text-[12px] font-medium text-ink-3">
            {SAVE_NOTICE_TEXT[saver.notice]}
          </p>
        )}
        {error && (
          <p role="alert" className="basis-full text-[13px] font-semibold text-warn">
            {error}
          </p>
        )}
      </div>

      {/*
       * THE DESCRIBE SECTION (R3). The stored prose, editable by hand, and the vision model one
       * click away — always available, overwriting, no confirmation. The ALBUM closures are
       * spelled here because this component already knows its table: `AlbumSelectionPane` receives
       * an `AlbumExplorerPhoto` (Phase 2's dispatcher narrowed it), so no `origin` read and no
       * branch is needed — the media arm's twin mount lives in `MediaPane.tsx`.
       */}
      <PhotoDescription
        description={photo.description}
        emptyNote="She cannot talk about this photo until it is described — it fills in on its own once the photo is hers, or write it yourself."
        onSave={(text) => editNinaAvatarDescriptionAction({ id: photo.id, description: text })}
        onRedescribe={() => describeNinaAvatarAction(photo.id)}
      />
    </aside>
  )
}
