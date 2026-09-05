'use client'

import * as React from 'react'

import { Button, CONTROL_CLASS, Field } from '@/components/ui'
import { folderName, folderParent, isInFolderTree } from '@/lib/admin/filetree'
import {
  createNinaAlbumFolderAction,
  deleteNinaAlbumFolderAction,
  moveNinaAlbumFolderAction,
  renameNinaAlbumFolderAction,
  type AdminActionResult,
} from '@/lib/admin/ninaAlbumActions'
import { cn } from '@/lib/cn'

/**
 * One folder's maintenance menu — R1's *"easier to maintain"*, at the tree node it acts on.
 *
 * ── FOUR PANELS, NO MODAL, AND THE INLINE-PANEL ROW IS THE PRECEDENT ────────────────────────
 * The admin memory page's old ledger row is the shape: a `mode` union, one inline panel
 * per mode, a single `run()` that owns the pending transition and the error line, and a Cancel that
 * just sets `mode` back. Nothing here opens a `<dialog>`. `DetailPanel`'s header explains when a
 * native modal earns its keep — a picture flush to three edges, a focus trap worth having — and
 * none of that describes a text field and two buttons. A tree row is also the operator's *place*
 * in a hundreds-deep album, and a modal is precisely the thing that loses it.
 *
 * ── WHY "MOVE TO…" IS A TARGET LIST AND NOT A DRAG ──────────────────────────────────────────
 * Dragging a folder onto another folder is the gesture a file manager suggests, and it is
 * deliberately not built here. Phase 5 owns `dragover`/`drop` on this explorer, and its handler
 * exists to read a folder dragged out of **Windows Explorer** via
 * `DataTransferItem.webkitGetAsEntry()`. Putting an in-page drag protocol on the same elements
 * makes one handler disambiguate an OS folder from an in-page selection, and the failure mode of
 * getting that wrong is silent: either a drop that should have moved 40 rows re-uploads 40 files,
 * or a dropped folder from the desktop is read as a move and uploads nothing. A named target list
 * cannot be misread. Internal drag-to-move is a follow-up card, not a shortcut.
 *
 * ── THE SERVER OWNS EVERY REFUSAL ───────────────────────────────────────────────────────────
 * This component does not pre-validate a name, pre-compute a collision or grey out an illegal
 * target. `lib/admin/folderOps.ts` decides all of it and its sentences are what render in the
 * error line, so there is exactly one place a rule lives and no chance of a control that permits
 * what the action refuses (or, worse, forbids what it would have allowed). The one thing computed
 * here is which targets to *offer*, and offering a bad one costs a refusal the operator can read.
 *
 * The path helpers come from `lib/admin/filetree.ts` and **not** from `lib/admin/folderOps.ts`,
 * which holds the same phase's Zod schemas: that module's header explains it, and the short
 * version is that no component in this repo pulls `zod` into a client bundle and this one is not
 * going to be the first. `filetree.ts` is zero-import by design.
 */
export interface FolderMenuProps {
  /** The folder this menu acts on. `''` is the album root: it can only take a new subfolder. */
  folder: string
  /** Every folder the album knows about, `''` included — the "Move to…" universe. */
  folders: readonly string[]
  /** Photos in this folder and everything under it, as phase 5's tree counted them. */
  photoCount: number
  /** Where the explorer should go next. Phase 5 owns navigation (`?folder=`). */
  onNavigate: (folder: string) => void
  /** A folder the server has just declared, so the tree can show it before the next server read. */
  onFolderCreated: (folder: string) => void
}

type Mode = 'idle' | 'menu' | 'create' | 'rename' | 'move' | 'delete'

export function FolderMenu({
  folder,
  folders,
  photoCount,
  onNavigate,
  onFolderCreated,
}: FolderMenuProps) {
  const [mode, setMode] = React.useState<Mode>('idle')
  const [name, setName] = React.useState('')
  const [target, setTarget] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  /**
   * Set when a delete comes back refused because her current photo is in this tree — so the second
   * answer ("delete the rest, keep her photo") appears exactly when it is the fix, and never
   * otherwise.
   *
   * ── RECONCILED: THIS REPLACES A `holdsCurrent` PROP, AND IT IS BETTER THAN ONE ──────────────
   * The draft took `holdsCurrent: boolean` and needed the client to know where her current photo
   * is. That is not derivable from anything phase 5 passes: the grid is ONE page of ONE folder, so
   * `photos.find((p) => p.isCurrent)` is `null` for almost every folder even when the flag should
   * be true — and a `false` there would offer a delete the server refuses while hiding the button
   * that answers the refusal. Making it true would have meant a new `getCurrentNinaAvatar` read on
   * `app/admin/nina/page.tsx` and a `currentFolder` prop threaded through two of phase 5's
   * components, i.e. this phase editing phase 5's page to duplicate a decision the server already
   * makes.
   *
   * So the affordance is driven by the server's own answer instead. `currentPhotoRefusal` already
   * returns a sentence naming the photo and both fixes; this flag is what turns the second fix into
   * a button, at the one moment it is relevant. It is the same rule `PhotoMoveBar`'s header states
   * — *"her current photo is the server's refusal, not a greyed button"* — applied here too, and it
   * costs one boolean instead of a read, a prop chain and a client-side guess.
   */
  const [keepOffer, setKeepOffer] = React.useState(false)
  const [pending, startTransition] = React.useTransition()

  const isRoot = folder === ''
  const label = isRoot ? 'the album root' : folderName(folder)

  /**
   * Every panel's submit, so the pending flag, the error line and the mode reset cannot get out of
   * step. `onOk` receives the whole result because `folder` (where to go next) and `note` (what a
   * delete left behind) are both on it, and a panel that ignored them would silently strand the
   * explorer in a folder that no longer exists.
   */
  function run(
    action: () => Promise<AdminActionResult>,
    onOk: (outcome: AdminActionResult) => void,
  ) {
    setError(null)
    startTransition(async () => {
      const outcome = await action()
      if (!outcome.ok) {
        setError(outcome.error ?? 'That did not work.')
        /*
         * A refused delete is the ONLY refusal that has a second answer, and
         * `currentPhotoRefusal` is the only thing that produces one — so a refusal while the delete
         * panel is open is exactly the condition that earns the "keep her photo" button. Reading it
         * off the mode rather than off the message keeps this free of string matching.
         */
        if (mode === 'delete') setKeepOffer(true)
        return
      }
      setMode('idle')
      setName('')
      setKeepOffer(false)
      onOk(outcome)
    })
  }

  function open(next: Mode) {
    setError(null)
    setKeepOffer(false)
    setMode(next)
    // A rename starts from the name it has; a create starts empty. Prefilling the rename field is
    // what makes "fix a typo in one character" a keystroke instead of a retype.
    setName(next === 'rename' ? label : '')
    if (next === 'move') setTarget(folderParent(folder))
  }

  /**
   * The destinations this folder may be moved to. A folder cannot go inside its own tree, and it
   * cannot go where it already is — both are refused by `planFolderMove` anyway, and filtering
   * them out here is only so the list is short enough to read.
   */
  const moveTargets = React.useMemo(() => {
    const seen = new Set<string>([''])
    for (const candidate of folders) {
      if (isInFolderTree(candidate, folder)) continue
      if (candidate === folderParent(folder)) continue
      seen.add(candidate)
    }
    if (folderParent(folder) === '') seen.delete('')
    return [...seen].sort()
  }, [folders, folder])

  /*
   * ── THE PANELS OVERLAY THE RAIL; THEY ARE NOT LAID OUT INSIDE IT ────────────────────────────
   * The trigger renders inline in `FolderTree`'s `Row`, which is a 200 px flex line holding the
   * chevron, the folder's `<Link>` and its count. An open panel as a fourth flex ITEM would
   * squeeze those three and then wrap a text field into ~60 px. So the trigger stays in the line
   * and every panel is `absolute` under it, at a width a sentence can actually be read at, with a
   * `z-20` that clears the rows below it. That is a layout necessity of the seam phase 5 left, not
   * a second opinion about where the affordance goes.
   */
  return (
    <div className="relative text-[12px]">
      {mode === 'idle' ? (
        <button
          type="button"
          aria-label={`Folder actions for ${label}`}
          className="rounded-field px-1.5 py-0.5 font-semibold text-ink-3 hover:bg-paper-2"
          onClick={() => setMode('menu')}
        >
          &hellip;
        </button>
      ) : (
        <button
          type="button"
          aria-label="Close folder actions"
          className="rounded-field px-1.5 py-0.5 font-semibold text-ink-2 hover:bg-paper-2"
          onClick={() => {
            setMode('idle')
            setError(null)
          }}
        >
          &times;
        </button>
      )}

      {mode === 'menu' && (
        <div className="absolute top-full right-0 z-20 mt-1 flex w-[280px] flex-col items-start gap-0.5 rounded-card bg-paper-2 p-1.5 shadow-sheet">
          <MenuItem onClick={() => open('create')}>New subfolder</MenuItem>
          {!isRoot && <MenuItem onClick={() => open('rename')}>Rename</MenuItem>}
          {!isRoot && <MenuItem onClick={() => open('move')}>Move to&hellip;</MenuItem>}
          {!isRoot && (
            <MenuItem destructive onClick={() => open('delete')}>
              Delete&hellip;
            </MenuItem>
          )}
        </div>
      )}

      {(mode === 'create' || mode === 'rename') && (
        <div className="absolute top-full right-0 z-20 mt-1 w-[280px] rounded-card bg-paper-2 p-3 shadow-sheet">
          <Field label={mode === 'create' ? `New folder inside ${label}` : `Rename ${label}`}>
            <input
              autoFocus
              aria-label={mode === 'create' ? 'New folder name' : 'Folder name'}
              className={CONTROL_CLASS}
              value={name}
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <div className="mt-2 flex gap-2">
            <Button
              size="md"
              disabled={pending || name.trim().length === 0}
              onClick={() =>
                mode === 'create'
                  ? run(
                      () => createNinaAlbumFolderAction({ parent: folder, name }),
                      (outcome) => {
                        // The declaration has landed, but this render still holds the folder list
                        // the page came with. The tree is told directly, and the explorer walks
                        // into the folder — which is what makes the next drop land in the folder
                        // that was just named.
                        if (outcome.folder != null) {
                          onFolderCreated(outcome.folder)
                          onNavigate(outcome.folder)
                        }
                      },
                    )
                  : run(
                      () => renameNinaAlbumFolderAction({ folder, name }),
                      (outcome) => {
                        if (outcome.folder != null) onNavigate(outcome.folder)
                      },
                    )
              }
            >
              {mode === 'create' ? 'Create' : 'Rename'}
            </Button>
            <Button size="md" variant="ghost" disabled={pending} onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === 'move' && (
        <div className="absolute top-full right-0 z-20 mt-1 w-[280px] rounded-card bg-paper-2 p-3 shadow-sheet">
          <Field
            label={`Move ${label} into`}
            hint="No photo is re-uploaded — only the folder changes."
          >
            <select
              aria-label={`Move ${label} into`}
              className={CONTROL_CLASS}
              value={target}
              disabled={pending}
              onChange={(event) => setTarget(event.target.value)}
            >
              {moveTargets.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {candidate === '' ? 'The album root' : candidate}
                </option>
              ))}
            </select>
          </Field>
          <div className="mt-2 flex gap-2">
            <Button
              size="md"
              disabled={pending || moveTargets.length === 0}
              onClick={() =>
                run(
                  () => moveNinaAlbumFolderAction({ folder, parent: target }),
                  (outcome) => {
                    if (outcome.folder != null) onNavigate(outcome.folder)
                  },
                )
              }
            >
              Move
            </Button>
            <Button size="md" variant="ghost" disabled={pending} onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === 'delete' && (
        <div className="absolute top-full right-0 z-20 mt-1 w-[280px] rounded-card border border-red/40 bg-paper-2 p-3 shadow-sheet">
          <p className="mb-2 max-w-[54ch] font-semibold text-red">
            Delete {label} and the {photoCount} photo{photoCount === 1 ? '' : 's'} in it and under
            it. The rows go first and the files behind them are deleted afterwards, best effort — a
            file left behind is recoverable, a missing file under a live row is a broken picture in
            her album.
          </p>
          {keepOffer && (
            <p className="mb-2 max-w-[54ch] font-semibold text-ink-2">
              Her current photo is in here. It cannot be deleted — she is never left without a face
              — so either make another photo current first, or delete the rest and leave that one
              behind in this folder.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="md"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(
                  () => deleteNinaAlbumFolderAction({ folder, keepCurrent: false }),
                  (outcome) => onNavigate(outcome.folder ?? folderParent(folder)),
                )
              }
            >
              Delete the folder
            </Button>
            {keepOffer && (
              <Button
                size="md"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run(
                    () => deleteNinaAlbumFolderAction({ folder, keepCurrent: true }),
                    (outcome) => onNavigate(outcome.folder ?? folder),
                  )
                }
              >
                Delete the rest, keep her photo
              </Button>
            )}
            <Button size="md" variant="ghost" disabled={pending} onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error != null && (
        <p
          role="alert"
          className="absolute top-full right-0 z-20 mt-1 w-[280px] rounded-card bg-paper-2 p-2 font-semibold text-warn shadow-sheet"
        >
          {error}
        </p>
      )}
    </div>
  )
}

/** A menu row. `destructive` is the `Button` variant's colour without the button's height. */
function MenuItem({
  destructive = false,
  onClick,
  children,
}: {
  destructive?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-field px-2 py-1 text-left font-semibold hover:bg-card',
        destructive ? 'text-red' : 'text-ink-2',
      )}
    >
      {children}
    </button>
  )
}
