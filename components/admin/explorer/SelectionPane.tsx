'use client'

import { useState, useTransition } from 'react'

import { CircleFrame } from '@/components/admin/CircleFrame'
import { CropStudio } from '@/components/admin/CropStudio'
import { Button } from '@/components/ui'
import {
  deleteNinaAvatarAction,
  describeNinaAvatarAction,
  saveNinaAvatarCropAction,
  setCurrentNinaAvatarAction,
} from '@/lib/admin/ninaAlbumActions'
import { folderBreadcrumbs } from '@/lib/admin/filetree'
import { isIdentityCrop, resolveCrop, type NinaCrop } from '@/lib/nina/crop'

import type { ExplorerPhoto } from './model'

/**
 * The details rail: what this file is, how her face sits in the circle, and what can be done to it.
 *
 * ── THE FRAMING HALF IS `AlbumManager.tsx:84-192`, MOVED, NOT REWRITTEN ─────────────────────
 * Same `draft` / `stored` / `dirty` triple, same `run()` transition helper, same "Save framing" /
 * "Reset framing" pair going through one action, same two sanity circles at 44 px and 28 px with the
 * same sentence under them. F33 landed framing and it is correct; this phase re-hosts it and does
 * not re-litigate it. `CropStudio` and `CircleFrame` are imported unmodified — `CropStudio` measures
 * its own frame with a `ResizeObserver` (`CropStudio.tsx:70-78`), which is exactly why it survives
 * the move from a 460 px column into a 320 px rail without a line changing.
 *
 * ── WHAT IS NEW IS ONE BUTTON ───────────────────────────────────────────────────────────────
 * *"in the file explorer view, we can click a photo and select it as profile picture"* — R1's last
 * clause is the primary action at the top of the action list, and it calls the
 * `setCurrentNinaAvatarAction` that has existed since F33. Phase 4 moved the `glm-4.6v` describe
 * onto this path (non-fatally), which is why the button can take several seconds and says so
 * through `Button`'s `loading` state rather than appearing dead.
 *
 * ── NO OPTIMISTIC COPY OF THE ALBUM ─────────────────────────────────────────────────────────
 * `AlbumManager`'s docstring called this out as *"the one class of bug this screen could plausibly
 * have shipped"*, and it still applies: every action calls `revalidatePath('/admin/nina')`, the page
 * is `force-dynamic`, so the photos arrive from the server on every render and there is nothing here
 * to keep in sync.
 *
 * ── `description` IS NEVER RENDERED ─────────────────────────────────────────────────────────
 * Invariant 5. `AlbumManager.tsx:167-169` printed the prose into the page, which this pane
 * deliberately does not do: the row says *whether* she can talk about this photo, not what a vision
 * model wrote. It is her prompt's private input.
 */

export function SelectionPane({
  photo,
  onClose,
  onRemoved,
}: {
  photo: ExplorerPhoto
  onClose: () => void
  /** Selection has to be dropped by the owner — the row is gone. */
  onRemoved: () => void
}) {
  /** The crop being dragged. `null` means "the stored one", which is what Reset restores to. */
  const [draft, setDraft] = useState<NinaCrop | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

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

  /* `folderBreadcrumbs` (phase 2's name; the draft assumed `breadcrumbFor`) returns crumbs of
   * `{ path, name, depth, isCurrent }` — so the label is `name`, and the root's own name is
   * `NINA_FOLDER_ROOT_LABEL`, which is why "Album" needs no special case here. */
  const trail = folderBreadcrumbs(photo.folder)
    .map((crumb) => crumb.name)
    .join(' / ')

  return (
    <aside className="rounded-card border border-rule bg-card p-5">
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
          className="shrink-0 px-1 text-[13px] font-semibold text-ink-3"
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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="md"
          disabled={!dirty || pending}
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
          {dirty ? 'Save framing' : 'Framing saved'}
        </Button>
        <Button
          size="md"
          variant="secondary"
          disabled={pending || (isIdentityCrop(crop) && !dirty)}
          onClick={() =>
            run(
              () => saveNinaAvatarCropAction({ id: photo.id, scale: 1, x: 0, y: 0 }),
              () => setDraft(null),
            )
          }
        >
          Reset framing
        </Button>
      </div>

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
       * THE ACTION LIST. One vertical stack, primary first.
       *
       * SEAM — PHASE 7. "Share link to Nina" is one more entry in this list, directly under
       * "Set as her profile picture". It needs `shareOrigin()` as a prop, because
       * `lib/share/origin.ts:1` is `server-only` and invariant 9 forbids a `NEXT_PUBLIC_` for it:
       * thread it `app/admin/nina/page.tsx` -> `FileExplorer` -> `SelectionPane`. Nothing about
       * selection needs restructuring — the selected photo's id is `photo.id`, right here.
       *
       * The leading `*` on every line is load-bearing, not cosmetic: `ci:client-secret-guard`'s
       * Rule 3 forbids the string above anywhere in `app/`, `lib/` or `components/`, and its
       * comment exemption (`scripts/check-client-secret-boundary.mjs`'s `isComment`) recognises
       * `//`, `/*` and `*` — so a JSX comment whose continuation lines are bare prose fails the
       * guard while quoting the rule it is obeying.
       */}
      <div className="mt-5 space-y-2 border-t border-rule pt-4">
        <Button
          size="md"
          fullWidth
          loading={pending}
          disabled={pending || photo.isCurrent}
          onClick={() => run(() => setCurrentNinaAvatarAction(photo.id))}
        >
          {photo.isCurrent ? 'Her profile picture' : 'Set as her profile picture'}
        </Button>

        {photo.description == null && (
          <Button
            size="md"
            variant="secondary"
            fullWidth
            loading={pending}
            disabled={pending}
            onClick={() => run(() => describeNinaAvatarAction(photo.id))}
          >
            Describe it
          </Button>
        )}

        <Button
          size="md"
          variant="destructive"
          fullWidth
          disabled={pending || photo.isCurrent}
          title={
            photo.isCurrent
              ? 'Make another photo hers first — she is never left without one.'
              : undefined
          }
          onClick={() => run(() => deleteNinaAvatarAction(photo.id), onRemoved)}
        >
          Remove
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[13px] font-semibold text-warn">
          {error}
        </p>
      )}
    </aside>
  )
}
