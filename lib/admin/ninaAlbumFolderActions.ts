'use server'

import { del } from '@vercel/blob'
import { revalidatePath } from 'next/cache'

import { folderAncestors, folderParent, isInFolderTree } from '@/lib/admin/filetree'
import {
  currentPhotoKeptNote,
  currentPhotoRefusal,
  folderCreateSchema,
  folderDeleteSchema,
  folderMoveSchema,
  folderRenameSchema,
  photoMoveSchema,
  photoRemoveSchema,
  planFolderCreate,
  planFolderMove,
  planFolderRename,
  type CurrentPhotoRef,
} from '@/lib/admin/folderOps'
import type { AdminActionResult } from '@/lib/admin/ninaAlbumActions'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  declareNinaFolders,
  deleteNinaAvatars,
  deleteNinaAvatarsInFolderTree,
  deleteNinaFolderSubtree,
  getCurrentNinaAvatar,
  listNinaAvatarFolders,
  moveNinaAvatarsToFolder,
  renameNinaAvatarFolder,
  renameNinaFolderSubtree,
  type NinaAvatarBlobRef,
} from '@/lib/nina/queries'

/**
 * Folder maintenance: create, rename, move, delete, and the bulk move and remove that go with
 * them. R1's second half — *"make the photos much more structured and easier to maintain."*
 *
 * ── EVERY DECISION THAT DOES NOT NEED THE DATABASE IS IN `lib/admin/folderOps.ts` ────────────
 * This module carries `'use server'`, so it may export only async functions and cannot hold a Zod
 * schema or a pure predicate at all (`lib/nina/album.ts:144-148` states the rule). That constraint
 * turns out to be the right architecture anyway: the collision, cycle and depth refusals are the
 * part of this phase most worth testing, and `tests/admin.folderOps.test.ts` tests them without a
 * database. What is left here per action is four moves — gate, validate, plan, run — and it is
 * meant to stay that thin.
 *
 * ── MOVING A PHOTO OR A FOLDER IS AN UPDATE OF THE FOLDER COLUMN. NO BLOB IS COPIED. ────────
 * The plan's Scope section: *"Blob layout stays flat. Folders are a column, not a blob prefix — so
 * a rename is one UPDATE rather than an O(files) copy-and-delete."* So `renameNinaAvatarFolder`
 * rewrites the `folder` cell of every row in a subtree and touches no object in the store; the
 * blob pathnames stay the flat `nina/<userId>/avatar-<id>.<ext>` that `lib/admin/avatars.ts`
 * documents and `isAdminAvatarRequestPathname` guards, and neither the tree nor the grid can tell.
 * Renaming a folder of four hundred photographs is therefore one statement rather than four
 * hundred copies and four hundred deletes, each of which could half-fail — and a half-failed
 * O(files) rename is a folder that exists twice with the photos split between the two.
 *
 * ── ROW FIRST, BLOB SECOND, BEST-EFFORT AND LOGGED ──────────────────────────────────────────
 * `deleteNinaAvatarAction` sets the rule and the reason: *"A failed `del` leaves an orphaned
 * object, which is recoverable... A deleted blob under a live row is a permanently broken image in
 * her album."* Both halves of it get bigger here and both stay right. See `reapAvatarBlobs` for
 * what a *batch* of `del`s makes of it.
 *
 * ── THE FOLDER LIST HAS TWO SOURCES AND NEITHER IS AUTHORITATIVE ────────────────────────────
 * A folder exists if a photograph is filed in it **or** if it is declared in `nina_folders`, and
 * `listNinaAvatarFolders` is the one function that answers the question — it UNIONs both, so
 * disagreement between them degrades instead of corrupting (invariant 11). Every planner below is
 * therefore handed that unioned listing via `existingFolders`, and the corollary is the one
 * ordering rule the table adds: **undeclare a subtree only when it is actually empty.**
 *
 * The single-photo delete and the crop live in `lib/admin/ninaAlbumAvatarActions.ts`. Nothing
 * outside the layer imports this module; everything reaches it through the
 * `lib/admin/ninaAlbumActions.ts` barrel.
 */

/**
 * How many blob URLs go into one `del` call. `del` takes an array, so the whole reap could be one
 * request — and that is exactly what makes the chunk worth having: `del` is all-or-nothing per
 * call, so a single 800-URL request that fails orphans 800 objects, while eight 100-URL requests
 * that fail on the fourth orphan 100 and delete 700. Since the failure mode of a blob reap is
 * "objects nothing references survive in the store", smaller batches are strictly less exposure
 * for the same number of bytes moved.
 */
const ADMIN_BLOB_DEL_BATCH = 100

/**
 * Delete the objects behind rows that are already gone. **Never called before the rows are
 * deleted**, and never allowed to fail an action.
 *
 * ── WHY A BATCH MAKES THE ORPHAN EXPOSURE BIGGER, AND WHY IT IS STILL THE RIGHT ORDER ───────
 * `deleteNinaAvatarAction` weighed one object: *"A failed `del` leaves an orphaned object, which
 * is recoverable (and is what `scripts/blob-reap.mjs` exists for, once it is taught the `nina/`
 * prefix — ruling D4's one follow-up card). A deleted blob under a live row is a permanently
 * broken image in her album."* A recursive folder delete weighs hundreds, and a batch of `del`s is
 * where a partial failure is most likely: the store is a network service, the call is not
 * transactional with Postgres, and nothing about it is atomic across chunks. So what happens when
 * it half-fails is stated here rather than discovered:
 *
 *   · The rows are already gone, which is the outcome the operator asked for. The album is
 *     correct, the tree is correct, and nothing renders a broken image.
 *   · The objects for the chunks that failed stay in the store, referenced by nothing. They cost
 *     storage and they show up in the free tier's usage number; they cannot corrupt anything.
 *   · Every failed chunk is logged with its URLs, so the orphans are *named* in the function log
 *     and not merely inferable from a diff of the store against the table.
 *   · Reaping them is `scripts/blob-reap.mjs`'s job — and it **still does not know the `nina/`
 *     prefix** (ruling D4's open card, restated in the plan's Rollback section). This phase widens
 *     the exposure that card describes from "a failed single delete" to "a failed chunk of a
 *     hundred", which is worth saying out loud and is not a reason to reverse the order: the
 *     reverse order trades a recoverable orphan for a permanently broken image.
 *
 * The thumbnail is reaped beside the original because phase 4 wrote it as a second object and
 * nothing else references it. A row with no thumbnail (anything that predates phase 1) simply
 * contributes one URL instead of two.
 */
async function reapAvatarBlobs(rows: readonly NinaAvatarBlobRef[]): Promise<void> {
  const urls = rows.flatMap((row) =>
    row.thumbUrl == null ? [row.blobUrl] : [row.blobUrl, row.thumbUrl],
  )
  if (urls.length === 0) return

  for (let start = 0; start < urls.length; start += ADMIN_BLOB_DEL_BATCH) {
    const chunk = urls.slice(start, start + ADMIN_BLOB_DEL_BATCH)
    try {
      await del(chunk)
    } catch (cause) {
      console.error(
        `[f34] ${chunk.length} album rows deleted, blobs left behind ` +
          '(blob:reap does not know the nina/ prefix yet — ruling D4)',
        chunk,
        cause,
      )
    }
  }
}

/** Her current photo, but only when it is inside `folder`'s tree. `null` otherwise. */
async function currentPhotoInFolder(
  userId: string,
  folder: string,
): Promise<CurrentPhotoRef | null> {
  const row = await getCurrentNinaAvatar(userId)
  if (row == null || !isInFolderTree(row.folder, folder)) return null
  return { id: row.id, folder: row.folder, filename: row.filename }
}

/** Her current photo, but only when its id is in `ids`. `null` otherwise. */
async function currentPhotoAmong(
  userId: string,
  ids: readonly string[],
): Promise<CurrentPhotoRef | null> {
  const row = await getCurrentNinaAvatar(userId)
  if (row == null || !ids.includes(row.id)) return null
  return { id: row.id, folder: row.folder, filename: row.filename }
}

/**
 * Every folder the album knows about — the planners' collision universe.
 *
 * `listNinaAvatarFolders` UNIONs the folders the photograph rows imply with the declarations in
 * `nina_folders`, and that is exactly the list a collision must be decided against: the
 * declarations alone would let "create" claim a folder that already holds three hundred
 * photographs, and the photograph rows alone would let the same empty folder be created twice.
 * A `photos: 0` entry is a legal result and is deliberately not filtered out here.
 */
async function existingFolders(userId: string): Promise<string[]> {
  return (await listNinaAvatarFolders(userId)).map((row) => row.folder)
}

/**
 * "New folder".
 *
 * ── AN EMPTY FOLDER IS DURABLE, AND THAT IS WHAT THIS ACTION WRITES ─────────────────────────
 * This docstring used to argue the opposite, and the argument was honest about the design it was
 * written against: a folder was only the `folder` column of the rows in it, so an empty one had
 * nothing to store and "create" could not insert anything. **The owner overruled that**, phase 1
 * added the `nina_folders` table, and a folder is now a thing that can be *declared* as well as
 * implied. So this action writes: one declaration per folder, and the folder survives a reload
 * with nothing in it.
 *
 * The rest of what it does was always the real work and is unchanged: it agrees with the server on
 * the normalised path (so the client and the server cannot spell the same folder two ways), it
 * bounds the depth against phase 2's constant, and it refuses a collision **against the folders
 * that exist right now** rather than against the list the page happened to render with.
 *
 * `revalidatePath` then makes the tree agree with that list — the folder list is a server read, a
 * concurrent upload may have added folders since this page rendered, and the re-render that ships
 * in the action's own response (see the Next.js Server Actions guide: `revalidatePath` includes a
 * fresh RSC payload in the same roundtrip) is the cheapest way to deliver both the new declaration
 * and whatever else has appeared.
 */
export async function createNinaAlbumFolderAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = folderCreateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That folder name is out of range.' }

  const plan = planFolderCreate({
    parent: parsed.data.parent,
    name: parsed.data.name,
    folders: await existingFolders(userId),
  })
  if (!plan.ok) return { ok: false, error: plan.error }

  /*
   * The write that makes the folder real. One row in `nina_folders`, and after it the folder
   * survives a reload with nothing in it — which is the whole reason that table exists.
   *
   * **The ancestors are declared too, and that is not defensive padding.** Creating `a/b/c` when
   * only `a` holds photographs must leave `a/b` existing as well, or the tree pane would show
   * `a`, synthesize `a/b` from `c`'s path, and then lose `a/b` the moment `c` is deleted — an
   * intermediate folder that vanishes while its parent and child both survive. `folderAncestors`
   * is phase 2's and returns every STRICT ancestor shallowest-first **with the album root included
   * as `''`** — which is fine to pass straight through, because `declareNinaFolders` filters the
   * root itself (`nina_folders` never stores it). Do not "tidy" that by slicing the first element
   * off here: the filter belongs in the one function that owns the rule.
   *
   * The return value (how many declarations were NEW) is deliberately dropped: `planFolderCreate`
   * has already refused a collision against the unioned listing, so a zero here means another tab
   * created the same folder between the read and this write — which is the outcome the operator
   * wanted either way, and reporting it as a failure would be a lie about the end state.
   */
  await declareNinaFolders(userId, [...folderAncestors(plan.folder), plan.folder])

  revalidatePath('/admin/nina')
  return { ok: true, folder: plan.folder, count: 0 }
}

/**
 * Rename a folder — one UPDATE over the subtree, no blob touched.
 *
 * The refusals are `planFolderRename`'s and they are argued there: the album root is not a folder,
 * a rename onto an occupied path is an unmergeable merge, and the depth bound is checked against
 * the deepest descendant rather than the destination. A rename of a folder that holds no rows
 * (one the operator just created) updates zero rows, rewrites its declaration, and is still `ok`.
 */
export async function renameNinaAlbumFolderAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = folderRenameSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That folder name is out of range.' }

  const plan = planFolderRename({
    folder: parsed.data.folder,
    name: parsed.data.name,
    folders: await existingFolders(userId),
  })
  if (!plan.ok) return { ok: false, error: plan.error }
  if (plan.folder === parsed.data.folder) return { ok: true, folder: plan.folder, count: 0 }

  /*
   * `renameNinaAvatarFolder` (phase 1's name — rename and move are one statement, because renaming
   * IS moving to a sibling path) returns a discriminated result, not a bare count.
   *
   * Its `'root'` and `'cycle'` refusals are the same two `planRelocation` already refused above,
   * with worse messages, so reaching them here would mean the planner and the statement disagree.
   * They are still handled rather than asserted away — phase 1 kept those guards deliberately, on
   * the `setCurrentNinaAvatar` posture that a cheap guard which could argue it is redundant is
   * still worth having, and the honest way to consume one is to consume it.
   *
   * **`moved: 0` is a SUCCESS**, not a failure: a folder can hold nothing but subfolders that hold
   * nothing, or — since `nina_folders` — can be a declared folder with no photographs in it at all.
   * Either way there are no rows to move and the rename still has to happen. Reporting it as an
   * error would make renaming an empty branch look broken.
   */
  const moved = await renameNinaAvatarFolder(userId, parsed.data.folder, plan.folder)
  if (!moved.ok) return { ok: false, error: 'That folder cannot be renamed to that.' }

  /*
   * The declarations follow the photographs, and BOTH halves are one rename.
   *
   * `renameNinaFolderSubtree` rewrites `nina_folders` with the same `folderSubtree` predicate
   * phase 1 uses for the rows — the same one deliberately, because a rename that matched the
   * photograph rows with `left()` and the declarations with `LIKE` would drift on exactly the
   * folder name (`100%`) that motivated `left()` in the first place.
   *
   * **Not in a transaction, and the failure mode is why that is tolerable.** These are two
   * statements over neon-http; if the second never runs, the photographs have moved and a stale
   * declaration is left at the old path. `listNinaAvatarFolders` UNIONs, so the visible result is
   * the new folder (carried by its photographs) plus an empty folder at the old name — untidy, and
   * fixable by deleting it, which is a state the operator can see and act on. The reverse order
   * would be worse: declarations at the new path with the photographs still at the old one reads
   * as two folders where one is a duplicate. Rows first, declarations second.
   *
   * Its count is dropped for the same reason `count` reports `moved.moved`: the operator asked
   * about photographs, and "0 declarations rewritten" is true of every folder that arrived by
   * being dropped.
   */
  await renameNinaFolderSubtree(userId, parsed.data.folder, plan.folder)

  revalidatePath('/admin/nina')
  return { ok: true, folder: plan.folder, count: moved.moved }
}

/**
 * Move a folder under a different parent — the same UPDATE as a rename, with a different
 * destination, and the same four refusals for the same reasons (`planFolderMove`).
 *
 * `parent: ''` moves it to the album root, which is why the schema takes a `folderPathSchema` and
 * not a non-empty string: the root is a legal destination and an illegal *source*.
 */
export async function moveNinaAlbumFolderAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = folderMoveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a folder path.' }

  const plan = planFolderMove({
    folder: parsed.data.folder,
    parent: parsed.data.parent,
    folders: await existingFolders(userId),
  })
  if (!plan.ok) return { ok: false, error: plan.error }
  if (plan.folder === parsed.data.folder) return { ok: true, folder: plan.folder, count: 0 }

  /* One statement for both verbs — see `renameNinaAlbumFolderAction` above for why `moved: 0` is
   * a success and why the two data-layer refusals are handled rather than asserted away. */
  const moved = await renameNinaAvatarFolder(userId, parsed.data.folder, plan.folder)
  if (!moved.ok) return { ok: false, error: 'That folder cannot be moved there.' }

  /* And the declarations follow, exactly as in a rename — a move IS a rename to a different
   * parent, so an undeclared destination would lose an empty moved folder on the next reload. */
  await renameNinaFolderSubtree(userId, parsed.data.folder, plan.folder)

  revalidatePath('/admin/nina')
  return { ok: true, folder: plan.folder, count: moved.moved }
}

/**
 * Move the selected photos into a folder. **An UPDATE of one column; no blob is copied.**
 *
 * No planner: nothing about this can collide (two photos in one folder is the normal state, not a
 * merge), nothing can cycle, and no descendant moves, so the destination's own bounds — depth,
 * length, grammar — are the whole check and `folderPathSchema` is where they live. This is also
 * the *sanctioned* way to merge two folders, which `planRelocation` refuses to do by rename: the
 * choice is made per photo, in front of the grid, and it is undone the same way.
 *
 * Nothing is declared here, and nothing needs to be: the destination is a folder the tree already
 * offered, and once the rows carry it the photographs are its evidence. A declaration that already
 * existed is left exactly as it was.
 *
 * `count` is what the statement reported, not `ids.length`. An id that has gone away since the
 * page rendered is not an error — the photo is not in that folder either way — and a caller that
 * wants to know reads the number back.
 */
export async function moveNinaAvatarsAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = photoMoveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a list of album photos.' }

  const count = await moveNinaAvatarsToFolder(userId, parsed.data.ids, parsed.data.folder)
  revalidatePath('/admin/nina')
  return { ok: true, folder: parsed.data.folder, count }
}

/**
 * Delete a folder and everything under it.
 *
 * ── THE CURRENT PHOTO CANNOT BE REMOVED, AND THIS SURFACES IT INSTEAD OF HALF-SUCCEEDING ────
 * `deleteNinaAvatar`'s WHERE clause has refused her current photo since F33 —
 * *"`eq(ninaAvatars.isCurrent, false)` in the WHERE clause is what makes 'zero current avatars'
 * unreachable rather than repaired"* — and phase 1's recursive delete carries the same clause, so
 * at the SQL layer this cannot take her face no matter what this function does. What it *can* do is
 * be honest, because a recursive delete that silently leaves one row behind looks like a delete
 * that half-worked, and the operator's next move is to try again and watch it half-work
 * identically.
 *
 * So the stand is taken **before any row is deleted**, and `currentPhotoRefusal` owns it: by
 * default the whole operation is refused, naming the photo and both fixes, with nothing deleted
 * and nothing to undo. With `keepCurrent` the operator has read that sentence and answered it; the
 * delete then runs and **leaves the folder holding exactly that one photo**, and `note` says which
 * photo stayed and why. Refusing beats half-succeeding here for a specific reason: a partial
 * delete of hundreds of rows has no inverse, and the rows it took are not coming back.
 *
 * ── ROW FIRST, BLOB SECOND ──────────────────────────────────────────────────────────────────
 * `reapAvatarBlobs` runs after the rows are gone and cannot fail this action; its header carries
 * what happens when a chunk of `del`s fails, and points at ruling D4's open card for
 * `scripts/blob-reap.mjs`, which still does not know the `nina/` prefix.
 *
 * The album root is refused outright. `folder: ''` would mean "delete every photo she has", and
 * that button does not belong on a screen whose job is organising them; the folders inside the
 * root are each deletable on their own.
 */
export async function deleteNinaAlbumFolderAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = folderDeleteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a folder path.' }
  const { folder, keepCurrent } = parsed.data

  if (folder === '') {
    return {
      ok: false,
      error: 'The album root is not a folder. Delete the folders inside it one at a time.',
    }
  }

  const current = await currentPhotoInFolder(userId, folder)
  const refusal = currentPhotoRefusal(current, keepCurrent)
  if (refusal != null) return { ok: false, error: refusal }

  const removed = await deleteNinaAvatarsInFolderTree(userId, folder)
  await reapAvatarBlobs(removed)

  /*
   * Undeclare the subtree — but ONLY when it is actually empty, which is exactly `current == null`.
   *
   * This is the one real trap `nina_folders` adds, and phase 1's `deleteNinaFolderSubtree` header
   * states the same rule from the other side. Under `keepCurrent` her current photograph stayed
   * behind, so the folder still holds a row and must go on existing; undeclaring it here would
   * leave a folder with a photograph in it and no declaration — which `listNinaAvatarFolders`
   * would paper over, because the photograph carries the folder, so the bug would stay invisible
   * until that last photograph was moved or made non-current and the folder silently disappeared.
   * A UNION that absorbs disagreement is a reason to be careful about creating it, not a licence.
   *
   * `current == null` is already the discriminator the return value below uses to decide where to
   * send the explorer next, so this is the same fact read twice rather than a second condition to
   * keep in step with the first.
   */
  if (current == null) await deleteNinaFolderSubtree(userId, folder)

  revalidatePath('/admin/nina')
  return {
    ok: true,
    // Where to look next. When her current photo stayed behind the folder still exists, so the
    // explorer stays in it; otherwise the folder is gone and its parent is the nearest thing left.
    folder: current == null ? folderParent(folder) : folder,
    count: removed.length,
    note: current == null ? undefined : currentPhotoKeptNote(current),
  }
}

/**
 * Remove the selected photos. The bulk form of `deleteNinaAvatarAction`, and the same two rules:
 * her current photo is refused up front by `currentPhotoRefusal` rather than silently skipped by
 * the statement's WHERE, and the blobs are reaped after the rows in best-effort chunks.
 *
 * One statement rather than a loop over `deleteNinaAvatar`: 200 selected photos would be 200
 * neon-http round trips inside one Server Action, which is both slow enough to hit the function's
 * duration limit and 200 chances to fail halfway with no record of where.
 *
 * The folders the removed rows were filed in are NOT undeclared. A row-by-row remove says nothing
 * about whether the operator is done with the folder, and an emptied folder that stays on the tree
 * is the outcome they can act on — deleting the folder is the gesture that undeclares it.
 */
export async function removeNinaAvatarsAction(input: unknown): Promise<AdminActionResult> {
  const { userId } = await requireAdmin()
  const parsed = photoRemoveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That is not a list of album photos.' }
  const { ids, keepCurrent } = parsed.data

  const current = await currentPhotoAmong(userId, ids)
  const refusal = currentPhotoRefusal(current, keepCurrent)
  if (refusal != null) return { ok: false, error: refusal }

  const removed = await deleteNinaAvatars(userId, ids)
  await reapAvatarBlobs(removed)

  revalidatePath('/admin/nina')
  return {
    ok: true,
    count: removed.length,
    note: current == null ? undefined : currentPhotoKeptNote(current),
  }
}
