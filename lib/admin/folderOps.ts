import { z } from 'zod'

import {
  folderDepth,
  folderName,
  folderParent,
  isInFolderTree,
  joinFolderPath,
  sanitiseFolderSegment,
  NINA_FOLDER_MAX_DEPTH,
  NINA_FOLDER_MAX_SEGMENT_CHARS,
} from '@/lib/admin/filetree'
import { avatarIdSchema, folderPathSchema } from '@/lib/admin/schema'

/**
 * Folder *maintenance* — what a folder operation refuses, and why, decided without a database.
 *
 * R1's justification is one clause of the user's sentence: *"make the photos much more structured
 * and easier to maintain."* Phase 4 gave the album structure; this module is the maintenance half,
 * and every function in it exists because a maintenance operation on hundreds of rows has exactly
 * one chance to be wrong.
 *
 * ── WHY A SEPARATE MODULE AND NOT `lib/admin/schema.ts` OR THE ACTION FILE ───────────────────
 * `lib/admin/ninaAlbumActions.ts` carries `'use server'`, and a `'use server'` module may export
 * **only async functions** — `lib/nina/album.ts:49-62` states that rule and why it forced
 * `NINA_ATTACH_MAX_CHARS` out of `albumActions.ts`. A Zod schema and a pure predicate are not
 * async functions, so they cannot be exported from there; and invariant 6 wants them exported
 * *somewhere*, because "UI behaviour worth testing is a pure function in `lib/`" and a rule like
 * "a folder cannot be moved inside itself" is precisely the kind of thing that is either tested or
 * shipped broken. `lib/admin/schema.ts` is phase 4's file in this plan set, so a second home for
 * the six object schemas is the smaller cost — and it lets the schemas sit beside the planners
 * that consume their output.
 *
 * The path arithmetic is one module further out, in `lib/admin/filetree.ts` (phase 2), and the
 * reason is the same one that made this module separate: this one imports `zod`, nothing under
 * `components/` in this repo reaches `zod`, and a module-level `z.object(...)` is a side effect no
 * bundler removes — so `FolderMenu` has to be able to reach `isInFolderTree` without reaching this
 * file. `filetree.ts` is zero-import by design and is the repo's one folder-path grammar.
 *
 * ── MOVING A FOLDER IS AN UPDATE OF ONE COLUMN. NO BLOB IS COPIED. ──────────────────────────
 * The plan's Scope section commits to it: *"Blob layout stays flat. Folders are a column, not a
 * blob prefix — so a rename is one UPDATE rather than an O(files) copy-and-delete."* Blob
 * pathnames keep the flat `nina/<userId>/avatar-<id>.<ext>` shape that `lib/admin/avatars.ts`
 * documents, and `isAdminAvatarRequestPathname` keeps guarding exactly that shape. Which means
 * renaming a folder holding four hundred photographs writes four hundred `folder` cells and moves
 * zero bytes; the alternative is four hundred copies and four hundred deletes, each of which can
 * half-fail, on an operation whose entire user-visible effect is a different word in a tree. The
 * refusals below are the price: because the column is the folder, two folders that come to share a
 * path are indistinguishable afterwards, so a collision has to be refused rather than merged.
 */

/**
 * How many photos one move or remove may name. A Server Action request body is capped at 1 MB by
 * the framework, and 500 nanoid(12) strings is ~8 KB — so this is not a body bound, it is a blast
 * radius: it is the number of rows one mis-click can move or destroy, and 500 is already more than
 * a screenful of the paginated grid phase 5 renders.
 */
export const ADMIN_FOLDER_OP_MAX_IDS = 500

/* ============================================================================
 * The six operations' input schemas
 * ==========================================================================*/

/**
 * `folderPathSchema` is phase 4's, and it is the *only* thing that decides whether a path is a
 * legal path — depth, total length, segment grammar, normalisation. These objects add the shape
 * around it and nothing else, so there is one answer to "is this a folder" in the codebase.
 *
 * A `name` is NOT a `folderPathSchema`: it is one segment a human typed, and it is bounded here
 * only loosely (non-empty, at most the segment ceiling) because `sanitiseFolderSegment` is what
 * decides what survives of it, and a planner is where a sanitisation that leaves nothing becomes
 * a sentence the operator can read instead of a field error.
 */
const folderNameSchema = z.string().trim().min(1).max(NINA_FOLDER_MAX_SEGMENT_CHARS)

const avatarIdsSchema = z.array(avatarIdSchema).min(1).max(ADMIN_FOLDER_OP_MAX_IDS)

export const folderCreateSchema = z.object({
  parent: folderPathSchema,
  name: folderNameSchema,
})
export type FolderCreateInput = z.infer<typeof folderCreateSchema>

export const folderRenameSchema = z.object({
  folder: folderPathSchema,
  name: folderNameSchema,
})
export type FolderRenameInput = z.infer<typeof folderRenameSchema>

export const folderMoveSchema = z.object({
  folder: folderPathSchema,
  /** The new containing folder. `''` moves it to the album root. */
  parent: folderPathSchema,
})
export type FolderMoveInput = z.infer<typeof folderMoveSchema>

export const photoMoveSchema = z.object({
  ids: avatarIdsSchema,
  folder: folderPathSchema,
})
export type PhotoMoveInput = z.infer<typeof photoMoveSchema>

/**
 * `keepCurrent` is the operator's explicit second answer to the refusal in `currentPhotoRefusal`,
 * and it is a required boolean rather than a defaulted one on purpose: a client that forgets the
 * field gets the safe branch by shape error, not by a default that could be flipped later.
 *
 * `folder` is checked for emptiness by the ACTION rather than by a `.min(1)` here, for the same
 * reason `factPurgeSchema.confirm` is a bare `z.string()` at `lib/admin/schema.ts:139-146`: "the
 * album root is not a folder" is a sentence the operator should read, not a field error.
 */
export const folderDeleteSchema = z.object({
  folder: folderPathSchema,
  keepCurrent: z.boolean(),
})
export type FolderDeleteInput = z.infer<typeof folderDeleteSchema>

export const photoRemoveSchema = z.object({
  ids: avatarIdsSchema,
  keepCurrent: z.boolean(),
})
export type PhotoRemoveInput = z.infer<typeof photoRemoveSchema>

/* ============================================================================
 * The planners
 * ==========================================================================*/

/** Either the folder path the operation should write, or the sentence explaining the refusal. */
export type FolderPlan = { ok: true; folder: string } | { ok: false; error: string }

const UNUSABLE_NAME =
  'That name leaves nothing usable. Letters, numbers, spaces, dots, dashes and underscores.'

/**
 * `New subfolder`. Refuses a name that sanitises away, a depth over the bound, and a path that
 * already exists.
 *
 * ── AN EMPTY FOLDER IS DURABLE, AND THIS FUNCTION ONLY DECIDES ITS PATH ─────────────────────
 * **Rewritten.** This docstring used to say the opposite — that a folder with no photos had
 * nothing to store, so "create" could not write a row and the folder lived in the explorer's state
 * until the first photograph landed in it. That was true of the reconciled plan and is no longer
 * true of the code: the owner decided empty folders are durable, so phase 1 added a `nina_folders`
 * table and `createNinaAlbumFolderAction` now writes a declaration through `declareNinaFolders`.
 *
 * What is left for THIS function is the half that was always the real work, and it is unchanged:
 * agree with the server on the normalised path, and refuse a collision against folders that
 * already exist — which is genuine server work because the page's folder list may be stale. It
 * still writes nothing and still knows nothing about tables; the action calls it, then persists
 * what it returns.
 *
 * **`folders` must be the UNIONED listing** (`listNinaAvatarFolders`, which merges the photograph
 * rows with the declarations), not either source alone. Against the declarations alone this would
 * happily "create" a folder that already holds three hundred photographs; against the photograph
 * rows alone it would let the operator create the same empty folder twice, and the second call
 * would be an `ON CONFLICT DO NOTHING` no-op reported as a success. `existingFolders` is the
 * helper that guarantees it.
 */
export function planFolderCreate(args: {
  parent: string
  name: string
  folders: readonly string[]
  maxDepth?: number
}): FolderPlan {
  const { parent, name, folders, maxDepth = NINA_FOLDER_MAX_DEPTH } = args

  const segment = sanitiseFolderSegment(name)
  if (segment == null || segment.length === 0) return { ok: false, error: UNUSABLE_NAME }

  const folder = joinFolderPath(parent, segment)
  const depth = folderDepth(folder)
  if (depth > maxDepth) {
    return {
      ok: false,
      error: `The album nests ${maxDepth} folders deep and that would be ${depth}.`,
    }
  }
  if (folders.some((existing) => existing === folder)) {
    return { ok: false, error: `${folder} already exists.` }
  }
  return { ok: true, folder }
}

/** Rename in place: the leaf changes, the parent does not. */
export function planFolderRename(args: {
  folder: string
  name: string
  folders: readonly string[]
  maxDepth?: number
}): FolderPlan {
  const { folder, name, folders, maxDepth = NINA_FOLDER_MAX_DEPTH } = args

  const segment = sanitiseFolderSegment(name)
  if (segment == null || segment.length === 0) return { ok: false, error: UNUSABLE_NAME }

  return planRelocation(folder, joinFolderPath(folderParent(folder), segment), folders, maxDepth)
}

/** Move to a different parent: the leaf is kept, the prefix changes. */
export function planFolderMove(args: {
  folder: string
  parent: string
  folders: readonly string[]
  maxDepth?: number
}): FolderPlan {
  const { folder, parent, folders, maxDepth = NINA_FOLDER_MAX_DEPTH } = args
  if (folder === '') {
    return { ok: false, error: 'The album root is not a folder — it cannot be moved or renamed.' }
  }
  return planRelocation(folder, joinFolderPath(parent, folderName(folder)), folders, maxDepth)
}

/**
 * Rename and move are the same UPDATE with a different destination, so they are the same four
 * refusals.
 *
 * 1. **The album root is not a folder.** There is no row whose folder is the root's parent.
 * 2. **A folder cannot land inside itself.** `A/B` → `A/B/C` is not a cycle in the data (the
 *    column would simply hold longer strings), but it is a cycle in the operator's intent, and
 *    what it actually produces is every descendant re-rooted one level below where it started,
 *    forever, one level deeper each time. Refuse it and name both paths.
 * 3. **The destination tree must be EMPTY.** This is the strictest rule here and the most
 *    important. A rename onto an occupied path is a *merge*, and a merge of a folder column is
 *    not undoable: rename `Bali` onto `Trips` and the rows that were in each are afterwards
 *    indistinguishable, so "rename it back" cannot separate them again. Every other operation in
 *    this phase is reversible by running its inverse; this one would not be, so it is refused.
 *    Merging is still available, deliberately, as the *explicit* gesture: select the photos and
 *    move them, which is a choice made per photo and visible in the grid while it is made.
 * 4. **The deepest descendant must still fit.** Moving `Trips/Bali` (which holds
 *    `Trips/Bali/2024/Ubud`) into `Archive/Old/Trips` shifts every descendant down by the
 *    difference in depth, so the bound has to be checked against the deepest row in the subtree
 *    and not against the destination. Checking only the destination is the bug this exists to
 *    avoid: it passes, and then the tree holds paths phase 4's own schema would reject.
 *
 * A destination equal to the source is a no-op that returns `ok` — an idempotent rename is the
 * operator pressing Save without having typed anything, and a refusal there would be noise.
 */
function planRelocation(
  from: string,
  to: string,
  folders: readonly string[],
  maxDepth: number,
): FolderPlan {
  if (from === '') {
    return { ok: false, error: 'The album root is not a folder — it cannot be moved or renamed.' }
  }
  if (to === '') return { ok: false, error: 'A folder needs a name.' }
  if (to === from) return { ok: true, folder: to }

  if (isInFolderTree(to, from)) {
    return { ok: false, error: `${from} cannot be moved inside itself (${to}).` }
  }

  const occupied = folders.find((existing) => isInFolderTree(existing, to))
  if (occupied != null) {
    return {
      ok: false,
      error:
        `${to} already exists${occupied === to ? '' : ` (${occupied} is inside it)`}. ` +
        'Two folders cannot be merged by renaming one onto the other — the photos would ' +
        'no longer be tellable apart. Pick a different name, or select the photos and move ' +
        'them across.',
    }
  }

  const deepest = deepestDepthAfter(from, to, folders)
  if (deepest > maxDepth) {
    return {
      ok: false,
      error:
        `That would put photos ${deepest} folders deep and the album stops at ${maxDepth}. ` +
        'Move the subfolders out first, or pick a shallower destination.',
    }
  }

  return { ok: true, folder: to }
}

/**
 * The depth of the deepest path in `from`'s subtree once the subtree is re-rooted at `to`. Every
 * descendant shifts by the same amount — the difference in depth between the two roots — so this
 * is one pass and no string surgery.
 */
function deepestDepthAfter(from: string, to: string, folders: readonly string[]): number {
  const shift = folderDepth(to) - folderDepth(from)
  let deepest = folderDepth(to)
  for (const folder of folders) {
    if (!isInFolderTree(folder, from)) continue
    const after = folderDepth(folder) + shift
    if (after > deepest) deepest = after
  }
  return deepest
}

/* ============================================================================
 * The current photo
 * ==========================================================================*/

/** Just enough of her current avatar to name it in a refusal. Assignable from `NinaAvatarRow`. */
export interface CurrentPhotoRef {
  id: string
  folder: string
  filename: string | null
}

/**
 * How a refusal names the photo it is protecting. The filename, because that is the word the
 * operator sees in the grid; the id as the fallback, because a row that predates phase 1's
 * `filename` column has nothing else to be called.
 */
export function describeCurrentPhoto(current: CurrentPhotoRef): string {
  const name = current.filename ?? current.id
  return `${name} (${current.folder === '' ? 'the album root' : current.folder})`
}

/**
 * ── THE CURRENT PHOTO CANNOT BE REMOVED ─────────────────────────────────────────────────────
 * `deleteNinaAvatar`'s WHERE clause has refused it since F33 and says why in as many words
 * (`lib/nina/queries.ts:1116-1128`): *"`eq(ninaAvatars.isCurrent, false)` in the WHERE clause is
 * what makes 'zero current avatars' unreachable rather than repaired."* The action file repeats
 * it at `lib/admin/ninaAlbumActions.ts:182-184`: *"the current photo cannot be removed... which is
 * what makes 'zero current avatars' unreachable rather than repaired."* Phase 1's recursive and
 * batch deletes carry the same clause, so at the SQL layer a folder delete over four hundred rows
 * already cannot take her face.
 *
 * What SQL cannot do is be honest about it. A recursive delete that quietly leaves one row behind
 * looks like a delete that half-worked, and the operator's next move is to try again — which
 * quietly leaves the same row behind. So this function makes the stand explicit, in two steps,
 * before any row is touched:
 *
 *   · **By default it refuses the whole operation** and names the photo and the reason. Nothing is
 *     deleted, so the folder is exactly as it was and either fix — make another photo current, or
 *     move that one out — is available with nothing to undo first. Refusing beats half-succeeding
 *     precisely because a partial delete of hundreds of rows has no inverse.
 *   · **With `keepCurrent` the operator has read that sentence and answered it.** Then the delete
 *     runs and leaves the folder holding exactly that one photo, and the result says so via
 *     `currentPhotoKeptNote` — so "the folder is still there" is explained rather than discovered.
 *
 * `current` is `null` when her current photo is not in scope at all, which is the ordinary case
 * and the one that must not cost a branch at the call site.
 */
export function currentPhotoRefusal(
  current: CurrentPhotoRef | null,
  keepCurrent: boolean,
): string | null {
  if (current == null) return null
  if (keepCurrent) return null
  return (
    `That would remove her current photo — ${describeCurrentPhoto(current)} — and she is never ` +
    'left without a face, so that one row cannot be deleted. Make another photo current first, ' +
    'or delete the rest and leave it behind.'
  )
}

/** The other half of the same honesty: what stayed, and why, after a `keepCurrent` delete. */
export function currentPhotoKeptNote(current: CurrentPhotoRef): string {
  return (
    `${describeCurrentPhoto(current)} stayed behind — it is her current photo and cannot be ` +
    'removed. Make another photo current, then delete it.'
  )
}
