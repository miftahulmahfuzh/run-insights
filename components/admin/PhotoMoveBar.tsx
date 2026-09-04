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
          className={`${CONTROL_CLASS} max-w-[240px]`}
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

        <Button
          size="md"
          disabled={pending || targets.length === 0}
          onClick={() => run(() => moveNinaAvatarsAction({ ids, folder: target }))}
        >
          Move
        </Button>

        <Button
          size="md"
          variant="destructive"
          disabled={pending}
          onClick={() => {
            setError(null)
            setConfirming(true)
          }}
        >
          Remove&hellip;
        </Button>

        <Button size="md" variant="ghost" disabled={pending} onClick={onDone}>
          Clear
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
