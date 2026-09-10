'use client'

import { useEffect, useRef, useState, useTransition } from 'react'

import { CircleFrame } from '@/components/admin/CircleFrame'
import { CropStudio } from '@/components/admin/CropStudio'
import {
  CheckIcon,
  DownloadIcon,
  PersonFrameIcon,
  RotateCcwIcon,
  SparklesIcon,
  TrashIcon,
} from '@/components/admin/photoIcons'
import { ShareToNinaItem } from '@/components/admin/ShareToNinaItem'
import { TOUCH_ICON } from '@/components/admin/touch'
import { Button } from '@/components/ui'
import { useSavePhoto, type SaveNotice } from '@/components/ui/useSavePhoto'
import {
  deleteNinaAvatarAction,
  describeNinaAvatarAction,
  saveNinaAvatarCropAction,
  setCurrentNinaAvatarAction,
} from '@/lib/admin/ninaAlbumActions'
import { folderBreadcrumbs } from '@/lib/admin/filetree'
import { cn } from '@/lib/cn'
import { isIdentityCrop, resolveCrop, type NinaCrop } from '@/lib/nina/crop'

import type { ExplorerPhoto } from './model'

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
 * ── `description` IS NEVER RENDERED ─────────────────────────────────────────────────────────
 * Invariant 5. `AlbumManager.tsx:167-169` printed the prose into the page, which this pane
 * deliberately does not do: the row says *whether* she can talk about this photo, not what a
 * vision model wrote. It is her prompt's private input.
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
  shareOrigin,
  onClose,
  onRemoved,
}: {
  photo: ExplorerPhoto
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
       * THE ONE ICON ROW (R6). Left of the hairline: the crop's own two verbs — save the drag,
       * reset to the original. Right of it: what can be DONE to the photograph, in the grammar
       * `/admin/photos`' rail already established — make it hers, send it to her chat, have her
       * given eyes on it (only when she has none yet), take a copy of it, and destructive LAST.
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

        {photo.description == null && (
          <Button
            size="md"
            variant="secondary"
            className={RAIL_BUTTON}
            loading={pending}
            disabled={pending}
            aria-label="Describe it"
            title="Describe it"
            onClick={() => run(() => describeNinaAvatarAction(photo.id))}
          >
            <SparklesIcon className="size-4" />
          </Button>
        )}

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
          <p className="basis-full text-[12px] font-medium text-ink-3">
            {SAVE_NOTICE_TEXT[saver.notice]}
          </p>
        )}
        {error && (
          <p role="alert" className="basis-full text-[13px] font-semibold text-warn">
            {error}
          </p>
        )}
      </div>
    </aside>
  )
}
