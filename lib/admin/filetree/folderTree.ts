/**
 * The nested folder model the tree pane renders: flat per-folder counts in, one synthesized tree
 * out.
 *
 * `buildTree` is why an intermediate folder with no photos of its own still appears — without
 * synthesis, an album whose only photos are in `Faces/2026/studio` would have no `Faces` to click
 * and the folder would be unreachable — and why a declared empty folder (a `nina_folders` row) is
 * an ordinary zero-count entry and never filtered.
 *
 * Imports only `./bounds` for the root constants and `./pathGrammar` for the path arithmetic and
 * the `compareFolded` sort order, per the directory's import-purity rule (see `./bounds.ts`'s
 * header).
 */

import { NINA_FOLDER_ROOT, NINA_FOLDER_ROOT_LABEL, NINA_FOLDER_SEPARATOR } from './bounds'
import { compareFolded, foldFolderPath, normaliseFolderPath, splitFolderPath } from './pathGrammar'

/**
 * A row, as far as counting folders is concerned. Phase 1's tree projection is `(folder, id)`; the
 * id is not read here, because a count is over rows and asking for less is what makes this
 * assignable from any row shape (`AvatarLike` again).
 */
interface FolderRowLike {
  folder: string | null
}

/** One folder and how many photos are filed DIRECTLY in it. Phase 1's distinct-folder query with
 * per-folder counts returns this shape; `folderCounts` produces it from a flat row list. */
export interface FolderCount {
  folder: string | null
  count: number
}

/**
 * Fold a flat `(folder, id)` list into per-folder counts, merging folders that differ only in
 * casing and keeping the FIRST casing seen for display.
 *
 * The `buildTree` input the explorer uses at scale comes from phase 1's aggregate query — the plan
 * is explicit that *"nothing in this plan reads the album unpaginated"*. This function exists for
 * the other case: after an upload, phase 5 already knows the folders it just created and can fold
 * them into the tree optimistically instead of round-tripping. Same shape, no query.
 *
 * Input order is PRESERVED in the output and decides the display casing, exactly as
 * `albumPhotos` in `lib/nina/album.ts` preserves rather than imposes an order — a second opinion
 * about ordering next to the index that answers it is the thing to avoid.
 */
export function folderCounts(rows: readonly FolderRowLike[]): FolderCount[] {
  const byFolded = new Map<string, FolderCount>()
  for (const row of rows) {
    const folder = normaliseFolderPath(row.folder ?? NINA_FOLDER_ROOT)
    const folded = foldFolderPath(folder)
    const found = byFolded.get(folded)
    if (found == null) byFolded.set(folded, { folder, count: 1 })
    else found.count += 1
  }
  return [...byFolded.values()]
}

/**
 * One node of the tree pane. `ownCount` is what is filed here; `totalCount` includes every
 * descendant, which is what a COLLAPSED folder has to show — a folder reading "0" while holding
 * two hundred photos two levels down is the specific thing that makes a tree pane useless.
 */
export interface FolderNode {
  path: string
  name: string
  depth: number
  ownCount: number
  totalCount: number
  children: FolderNode[]
}

/**
 * The nested folder model the tree pane renders.
 *
 * Returns a SINGLE root node (`path: ''`, `name: NINA_FOLDER_ROOT_LABEL`) rather than an array of
 * top-level folders, so the album root is a selectable folder like any other and the pane has one
 * uniform renderer instead of a special case above the tree.
 *
 * Intermediate folders are SYNTHESIZED with `ownCount: 0`. An album whose only photos are in
 * `Faces/2026/studio` yields one populated entry — and without synthesis the tree would have no
 * `Faces` to click on and the folder would be unreachable.
 *
 * ── A ZERO COUNT IS AN ORDINARY ENTRY, NOT A SYNTHETIC ONE ──────────────────────────────────
 * `ownCount: 0` arrives two ways and this function cannot tell them apart, which is correct:
 * synthesized because an ancestor had no photos of its own, or **supplied**, because phase 1's
 * `listNinaAvatarFolders` unions in the `nina_folders` declarations and a declared empty folder is
 * exactly `{ folder, photos: 0 }`. So an entry with a zero must be kept and rendered, never
 * filtered — `entries.filter((e) => e.count > 0)` anywhere upstream of this call would delete
 * every empty folder the operator made, which is the whole feature that table exists for.
 * `tests/admin.filetree.test.ts` covers a zero-count entry as INPUT for that reason — in the
 * single-file original this section and its tests shared a file, and "the tests below" now means
 * that suite.
 *
 * Casing: the first spelling encountered wins, for the folder and for every ancestor, and a child's
 * `path` is always built from its parent's RESOLVED path — so a tree fed `Faces/2026` and then
 * `faces/2027` produces `Faces`, `Faces/2026`, `Faces/2027` and never a child whose path
 * contradicts its parent's.
 *
 * Children are sorted by `compareFolded` (`./pathGrammar`), which is deterministic and
 * locale-independent (see there). Recursion is bounded in practice by `NINA_FOLDER_MAX_DEPTH`; a
 * hand-written row deeper than that still builds, because this function normalises but does not
 * judge — judging is `validateFolderPath`'s job on the way IN.
 */
export function buildTree(entries: readonly FolderCount[]): FolderNode {
  const root: FolderNode = {
    path: NINA_FOLDER_ROOT,
    name: NINA_FOLDER_ROOT_LABEL,
    depth: 0,
    ownCount: 0,
    totalCount: 0,
    children: [],
  }
  const index = new Map<string, FolderNode>([[NINA_FOLDER_ROOT, root]])

  for (const entry of entries) {
    const folder = normaliseFolderPath(entry.folder ?? NINA_FOLDER_ROOT)
    const count = Number.isFinite(entry.count) ? Math.max(0, Math.trunc(entry.count)) : 0

    let node = root
    const acc: string[] = []
    for (const segment of splitFolderPath(folder)) {
      const parentPath = acc.join(NINA_FOLDER_SEPARATOR)
      const path =
        parentPath === NINA_FOLDER_ROOT
          ? segment
          : `${parentPath}${NINA_FOLDER_SEPARATOR}${segment}`
      const folded = foldFolderPath(path)
      let child = index.get(folded)
      if (child == null) {
        child = {
          path,
          name: segment,
          depth: acc.length + 1,
          ownCount: 0,
          totalCount: 0,
          children: [],
        }
        index.set(folded, child)
        node.children.push(child)
      }
      acc.push(child.name)
      node = child
    }
    node.ownCount += count
  }

  totaliseFolderNode(root)
  sortFolderNode(root)
  return root
}

/** Post-order fill of `totalCount`. Returns the subtotal so the parent needs one pass, not two. */
function totaliseFolderNode(node: FolderNode): number {
  let total = node.ownCount
  for (const child of node.children) total += totaliseFolderNode(child)
  node.totalCount = total
  return total
}

function sortFolderNode(node: FolderNode): void {
  node.children.sort((a, b) => {
    const byName = compareFolded(a.name, b.name)
    return byName !== 0 ? byName : compareFolded(a.path, b.path)
  })
  for (const child of node.children) sortFolderNode(child)
}

/**
 * The node at a path, or `null`. Folded and normalised, so `'FACES/2026'` finds `Faces/2026`.
 *
 * It lives in this directory rather than in the explorer because phase 5 (select a folder) and
 * phase 6 (rename one) would otherwise each write their own fold-comparing lookup, and two
 * spellings of "is this the same folder" is the failure this whole module is arranged to prevent.
 */
export function findFolderNode(root: FolderNode, path: string): FolderNode | null {
  const target = foldFolderPath(normaliseFolderPath(path))
  const visit = (node: FolderNode): FolderNode | null => {
    if (foldFolderPath(node.path) === target) return node
    for (const child of node.children) {
      const found = visit(child)
      if (found != null) return found
    }
    return null
  }
  return visit(root)
}
