'use client'

import * as React from 'react'

import { Button, CONTROL_CLASS } from '@/components/ui'
import {
  moveNinaAvatarsAction,
  removeNinaAvatarsAction,
  type AdminActionResult,
} from '@/lib/admin/ninaAlbumActions'

/**
 * What can be done to a selection of photos: move them into a folder, or remove them.
 *
 * ── IT READS PHASE 5'S SELECTION AND NEVER WRITES IT ────────────────────────────────────────
 * `selectedId` comes in as a prop and `onDone` goes out; there is no selection state in here.
 * That is not tidiness — phase 5's selection model is the thing this phase promised not to
 * restructure, and a second writer of it is exactly how the F17 double-upload bug happened
 * (invariant 6's *"nothing decides inside a `setState` updater"*). This component decides nothing
 * about the selection; it acts on the id it was handed and then asks for it to be cleared.
 *
 * The id becomes a one-element array at the action boundary, because the actions are plural by
 * design: `moveNinaAvatarsAction` and `removeNinaAvatarsAction` take `ids` and bound it with
 * `ADMIN_FOLDER_OP_MAX_IDS`, so the day the grid grows multi-select nothing on the server moves.
 *
 * ── MOVING PHOTOS IS THE SANCTIONED WAY TO MERGE TWO FOLDERS ────────────────────────────────
 * `planRelocation` refuses a folder rename that lands on an occupied path, because a folder-column
 * merge cannot be undone — the rows are afterwards indistinguishable. Moving photos into an
 * existing folder is the same end state reached the reversible way: chosen per photo, in front of
 * the grid, with the ids still in hand. And it is one UPDATE of one column: **no blob is copied**,
 * so moving four hundred photographs between folders moves zero bytes.
 *
 * ── REMOVE IS A TWO-STEP, AND HER CURRENT PHOTO IS THE SERVER'S REFUSAL, NOT A GREYED BUTTON ─
 * `currentId` is used only to warn. The refusal itself belongs to
 * `removeNinaAvatarsAction`/`currentPhotoRefusal`, which names the photo and both fixes, because a
 * disabled button in a grid of hundreds tells the operator nothing about which of their forty
 * selected photos is the problem.
 */
export interface PhotoMoveBarProps {
  /** The photo phase 5's grid currently has selected, or `null`. Renders nothing when `null`. */
  selectedId: string | null
  /** Every folder the album knows about; `''` is the album root. */
  folders: readonly string[]
  /** The folder the grid is showing, so it is not offered as a destination. */
  folder: string
  /** Her current photo's id, when it is on this page — for the warning only. */
  currentId: string | null
  /** Clear the selection. Phase 5 owns the selection; this is how it is handed back. */
  onDone: () => void
}

export function PhotoMoveBar({
  selectedId,
  folders,
  folder,
  currentId,
  onDone,
}: PhotoMoveBarProps) {
  const [target, setTarget] = React.useState('')
  const [confirming, setConfirming] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  /* One selection, expressed as the array the actions take. `ids` is what every call below
   * passes; `count` keeps the copy below honest if the selection ever becomes a set. */
  const ids = selectedId == null ? [] : [selectedId]
  const count = ids.length
  const holdsCurrent = currentId != null && selectedId === currentId

  const targets = React.useMemo(() => {
    const seen = new Set<string>([''])
    for (const candidate of folders) seen.add(candidate)
    seen.delete(folder)
    return [...seen].sort()
  }, [folders, folder])

  function run(action: () => Promise<AdminActionResult>) {
    setError(null)
    setNote(null)
    startTransition(async () => {
      const outcome = await action()
      if (!outcome.ok) {
        setError(outcome.error ?? 'That did not work.')
        return
      }
      setConfirming(false)
      setNote(outcome.note ?? null)
      onDone()
    })
  }

  if (count === 0) return null

  return (
    <div className="mb-4 rounded-card bg-paper-2 p-3 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink">
          {count} photo{count === 1 ? '' : 's'} selected
        </span>

        <select
          aria-label="Move the selected photos into"
          className={`${CONTROL_CLASS} min-w-0 flex-1 sm:max-w-[240px]`}
          value={target}
          disabled={pending}
          onChange={(event) => setTarget(event.target.value)}
        >
          {targets.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate === '' ? 'The album root' : candidate}
            </option>
          ))}
        </select>

        {/* Icon-only like the toolbar above the grid (2026-09-10 — one row on a 414 px screen):
            the accessible name is the `aria-label`, never the glyph. The confirm block below
            keeps its words: a destructive confirmation is exactly where labels beat icons. */}
        <Button
          size="md"
          aria-label="Move into the chosen folder"
          disabled={pending || targets.length === 0}
          onClick={() => run(() => moveNinaAvatarsAction({ ids, folder: target }))}
        >
          <FolderInputIcon className="size-5" />
        </Button>

        <Button
          size="md"
          variant="destructive"
          aria-label="Remove the selected photos"
          disabled={pending}
          onClick={() => {
            setError(null)
            setConfirming(true)
          }}
        >
          <TrashIcon className="size-5" />
        </Button>

        <Button
          size="md"
          variant="ghost"
          aria-label="Clear the selection"
          disabled={pending}
          onClick={onDone}
        >
          <XIcon className="size-5" />
        </Button>
      </div>

      {confirming && (
        <div className="mt-3 rounded-card border border-red/40 bg-card p-3">
          <p className="mb-2 max-w-[54ch] font-semibold text-red">
            Remove {count} photo{count === 1 ? '' : 's'} from the album and delete the files behind
            them. Rows first, files afterwards and best effort — a file left behind is recoverable,
            a missing file under a live row is a broken picture in her album.
          </p>
          {holdsCurrent && (
            <p className="mb-2 max-w-[54ch] font-semibold text-ink-2">
              Her current photo is in this selection and cannot be removed. Remove the rest and it
              stays, or make another photo current first.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="md"
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => removeNinaAvatarsAction({ ids, keepCurrent: false }))}
            >
              Remove {count}
            </Button>
            {holdsCurrent && (
              <Button
                size="md"
                variant="secondary"
                disabled={pending}
                onClick={() => run(() => removeNinaAvatarsAction({ ids, keepCurrent: true }))}
              >
                Remove the rest, keep her photo
              </Button>
            )}
            <Button
              size="md"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {note != null && <p className="mt-2 max-w-[54ch] font-semibold text-ink-2">{note}</p>}
      {error != null && (
        <p role="alert" className="mt-2 max-w-[54ch] font-semibold text-warn">
          {error}
        </p>
      )}
    </div>
  )
}

/*
 * The row's three glyphs, inlined rather than imported — `FileExplorer.tsx` records the full
 * ruling (Lucide, lucide-static 1.43.0, ISC, copied verbatim from unpkg with the same
 * normalisations; `aria-hidden` glyph, `aria-label` name). They are deliberately private to this
 * file, as `SessionRow.tsx`'s are to it: a shared module for five small paths has never been
 * worth the indirection here.
 */

/** Move the selection into the chosen folder: an arrow entering a folder. */
function FolderInputIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1" />
      <path d="M2 13h10" />
      <path d="m9 16 3-3-3-3" />
    </svg>
  )
}

/** Remove the selection: a lidded bin. */
function TrashIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

/** Clear the selection: a cross. */
function XIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}
