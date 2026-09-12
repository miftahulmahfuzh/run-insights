/**
 * The folder-path grammar: normalisation, validation, and every way one path is compared to or
 * taken apart into another.
 *
 * This is the module the rest of the directory leans on — `./sourceKey.ts` folds a path into the
 * dedupe key, `./uploadPlan.ts` validates every destination it plans, `./folderTree.ts` splits
 * and folds to build the tree — and it imports only `./bounds`, per the directory's
 * import-purity rule (see `./bounds.ts`'s header). Every reader is a `'use client'` explorer, a
 * `'use server'` action module, a Route Handler or the unit suite, which is why that rule exists.
 *
 * The rule this module lives by is the one the single `filetree.ts` lived by: **never store the
 * output of `normaliseFolderPath`. Store the `path` off an `ok` `validateFolderPath` result.**
 */

import {
  NINA_FOLDER_FORBIDDEN_RE,
  NINA_FOLDER_MAX_DEPTH,
  NINA_FOLDER_MAX_PATH_CHARS,
  NINA_FOLDER_MAX_SEGMENT_CHARS,
  NINA_FOLDER_ROOT,
  NINA_FOLDER_ROOT_LABEL,
  NINA_FOLDER_SEPARATOR,
} from './bounds'

/**
 * The mechanical half of the grammar: the best canonical reading of whatever string arrived.
 * Total, never throws, never fails.
 *
 * It does: Windows `\` -> `/` (the user drags out of Explorer, so this is the common case and not
 * the exotic one), drops empty segments so `/a//b/` is `a/b`, drops `.` segments as pure noise,
 * trims whitespace around each segment, and strips trailing dots and spaces from each segment —
 * a Windows shell can hand over `Trip 2024. ` and Windows itself cannot represent that name, so
 * storing it would create a folder the user can never reproduce.
 *
 * It does NOT resolve or remove `..`. **A `..` segment survives normalisation verbatim, so that
 * exactly one function decides its fate: `validateFolderPath`, which refuses it.** Resolving it
 * here would quietly turn `../../secrets` into `secrets`, and dropping it here would leave callers
 * unable to tell a traversal attempt from an ordinary path.
 */
export function normaliseFolderPath(raw: string): string {
  const out: string[] = []
  for (const part of raw.replace(/\\/g, NINA_FOLDER_SEPARATOR).split(NINA_FOLDER_SEPARATOR)) {
    const trimmed = part.trim()
    if (trimmed === '' || trimmed === '.') continue
    if (trimmed === '..') {
      out.push('..')
      continue
    }
    const segment = trimmed.replace(/[.\u0020]+$/, '')
    if (segment === '') continue
    out.push(segment)
  }
  return out.join(NINA_FOLDER_SEPARATOR)
}

/** Why a folder path is not storable. `'traversal'` is named apart from `'bad_segment'` because a
 * `..` is a different kind of problem from a `<` and phase 4's Zod message should be able to say
 * so.
 *
 * Exported for the sibling modules — `./uploadPlan.ts` extends it into `UploadRefusal`; NOT
 * re-exported by the barrel, which keeps the 2026-09-11 dead-exports audit's surface. */
export type FolderPathRejection =
  'too_deep' | 'path_too_long' | 'segment_too_long' | 'bad_segment' | 'traversal'

/** `segment` names the offending piece when there is one, so an error message can quote it. */
type FolderPathResult =
  { ok: true; path: string } | { ok: false; reason: FolderPathRejection; segment: string | null }

/**
 * The judging half of the grammar, and **the only gate anything storable passes through** — phase
 * 4's Zod schema, phase 5's drop handler and phase 6's rename box all call this rather than
 * spelling a second regex.
 *
 * Check order is fixed and asserted, because the reason travels to the user: whole-path bounds
 * first (they describe the shape of the drop), then per-segment ones (they can name the culprit).
 * The root is `ok` immediately — an empty path has no segments to judge.
 */
export function validateFolderPath(raw: string): FolderPathResult {
  const path = normaliseFolderPath(raw)
  if (path === NINA_FOLDER_ROOT) return { ok: true, path: NINA_FOLDER_ROOT }

  const segments = path.split(NINA_FOLDER_SEPARATOR)
  if (segments.length > NINA_FOLDER_MAX_DEPTH) {
    return { ok: false, reason: 'too_deep', segment: null }
  }
  if (path.length > NINA_FOLDER_MAX_PATH_CHARS) {
    return { ok: false, reason: 'path_too_long', segment: null }
  }
  for (const segment of segments) {
    if (segment === '..') return { ok: false, reason: 'traversal', segment }
    if (segment.length > NINA_FOLDER_MAX_SEGMENT_CHARS) {
      return { ok: false, reason: 'segment_too_long', segment }
    }
    if (NINA_FOLDER_FORBIDDEN_RE.test(segment)) {
      return { ok: false, reason: 'bad_segment', segment }
    }
  }
  return { ok: true, path }
}

/**
 * The comparison form, and **only** the comparison form. Display always uses the stored casing.
 *
 * The user's laptop is Windows, where `Faces\Nina` and `faces\nina` are one folder. Postgres would
 * make them two. So the dedupe key, the tree's grouping and every ancestor test fold, and the
 * album never grows a second `Faces` because a drag started from a differently-cased shortcut.
 *
 * `toLowerCase` and not `toLocaleLowerCase`: locale-dependent case mapping turns `I` into `ı`
 * under a Turkish locale, which would make one folder two on one machine and not another. A
 * dedupe key must not depend on the host's locale.
 */
export function foldFolderPath(path: string): string {
  return path.toLowerCase()
}

/** `''` -> `[]`, so `length` is the depth and every loop over it is empty at the root. */
export function splitFolderPath(path: string): string[] {
  return path === NINA_FOLDER_ROOT ? [] : path.split(NINA_FOLDER_SEPARATOR)
}

/** How many segments deep. The root is 0. */
export function folderDepth(path: string): number {
  return splitFolderPath(path).length
}

/** The last segment, or the root's label. What a tree row and the last crumb render. */
export function folderName(path: string): string {
  return splitFolderPath(path).at(-1) ?? NINA_FOLDER_ROOT_LABEL
}

/** The containing folder. The root's parent is the root, which is what a "go up" affordance
 * wants — it becomes a no-op rather than an error at the top. */
export function folderParent(path: string): string {
  const segments = splitFolderPath(path)
  segments.pop()
  return segments.join(NINA_FOLDER_SEPARATOR)
}

/**
 * Glue parts into one path and canonicalise the result. Used to place a walked relative directory
 * underneath the folder the drop landed in. Empty parts vanish, so `joinFolderPath('', 'a')` is
 * `'a'` and the album root needs no special case at any call site.
 *
 * The result is NOT validated — `..` survives, exactly as in `normaliseFolderPath`. Callers store
 * through `validateFolderPath`.
 */
export function joinFolderPath(...parts: readonly string[]): string {
  return normaliseFolderPath(parts.join(NINA_FOLDER_SEPARATOR))
}

/**
 * Every STRICT ancestor, shallowest first, with the root included as `''`. The root itself has no
 * ancestors and returns `[]`.
 *
 * Phase 5 uses it to expand the tree down to the selected folder in one pass instead of walking
 * the node graph; `planFolderUpload` (in `./uploadPlan.ts`) uses it to report the intermediate
 * folders a drop creates.
 */
export function folderAncestors(path: string): string[] {
  const segments = splitFolderPath(path)
  if (segments.length === 0) return []
  const out: string[] = [NINA_FOLDER_ROOT]
  const acc: string[] = []
  for (const segment of segments.slice(0, -1)) {
    acc.push(segment)
    out.push(acc.join(NINA_FOLDER_SEPARATOR))
  }
  return out
}

/** One breadcrumb. `isCurrent` is carried so the last crumb can render as text rather than as a
 * link, without the component recomputing which one it is. */
interface FolderCrumb {
  path: string
  name: string
  depth: number
  isCurrent: boolean
}

/**
 * The breadcrumb, root first, always at least one entry. The root is a crumb like any other and not
 * a fixed "Album /" prefix bolted on in JSX, so a click on it is the same handler as a click on any
 * other crumb.
 */
export function folderBreadcrumbs(path: string): FolderCrumb[] {
  const segments = splitFolderPath(path)
  const crumbs: FolderCrumb[] = [
    {
      path: NINA_FOLDER_ROOT,
      name: NINA_FOLDER_ROOT_LABEL,
      depth: 0,
      isCurrent: segments.length === 0,
    },
  ]
  const acc: string[] = []
  for (const [index, segment] of segments.entries()) {
    acc.push(segment)
    crumbs.push({
      path: acc.join(NINA_FOLDER_SEPARATOR),
      name: segment,
      depth: index + 1,
      isCurrent: index === segments.length - 1,
    })
  }
  return crumbs
}

/**
 * Is `ancestor` a STRICT ancestor of `path`? Folded, so casing does not matter; normalised, so a
 * Windows-separated argument works.
 *
 * The `/` in the `startsWith` test is the entire point: without it `'a'` is an ancestor of
 * `'ab/c'`, and phase 6's "you cannot move a folder into itself" check would let `Faces` move into
 * `Facesimile`. A folder is not its own ancestor, so a move-onto-self is `false` here and phase 6
 * refuses it as a no-op rather than as a cycle.
 */
export function isFolderAncestorOf(ancestor: string, path: string): boolean {
  const a = foldFolderPath(normaliseFolderPath(ancestor))
  const p = foldFolderPath(normaliseFolderPath(path))
  if (a === p) return false
  if (a === NINA_FOLDER_ROOT) return true
  return p.startsWith(`${a}${NINA_FOLDER_SEPARATOR}`)
}

/**
 * Is `candidate` inside `root`'s tree, **`root` itself included**? The inclusive sibling of
 * `isFolderAncestorOf`, and the one every *operation* wants.
 *
 * Both exist because the two questions are genuinely different and mixing them up is the bug.
 * "Can this folder be moved into that one?" is the strict question — a folder is not its own
 * ancestor, so a move-onto-self is a no-op rather than a cycle. "Does this subtree hold her
 * current photo?" and "does this recursive delete take this row?" are the inclusive question, and
 * an exclusive test there would let a delete of `Bali` claim not to touch a photo filed exactly at
 * `Bali`.
 *
 * The album root contains everything, itself included: `isInFolderTree('', '')` is `true`, where
 * `isFolderAncestorOf('', '')` is `false`. That asymmetry is the whole point of having both.
 *
 * Folded and normalised, like every other comparison here — the source is Windows, where
 * `Faces\Nina` and `faces/nina` are one folder.
 */
export function isInFolderTree(candidate: string, root: string): boolean {
  const c = foldFolderPath(normaliseFolderPath(candidate))
  const r = foldFolderPath(normaliseFolderPath(root))
  return c === r || isFolderAncestorOf(r, c)
}

/**
 * Compare two paths by their folded form, falling back to the raw form so the order is total.
 *
 * Plain `<`/`>` and not `localeCompare`: `localeCompare` with no locale argument reads the host's,
 * so the same tree would sort differently on two machines and the unit suite could not assert an
 * order at all. It is lexicographic rather than natural, so `Folder 10` sorts before `Folder 2` —
 * a known, deliberate limitation, filed as a handoff rather than solved with a collator.
 *
 * The single-file original declared this in its diff section because `planFolderUpload` was its
 * heaviest user; the split moves it here beside `foldFolderPath`, which is what it is — a total
 * order over paths — and it is now the sort key of `./uploadPlan.ts`'s folder list AND
 * `./folderTree.ts`'s children alike. Exported for exactly those two siblings; NOT re-exported by
 * the barrel.
 */
export function compareFolded(a: string, b: string): number {
  const fa = foldFolderPath(a)
  const fb = foldFolderPath(b)
  if (fa < fb) return -1
  if (fa > fb) return 1
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/** One segment, cleaned the way `normaliseFolderPath` cleans one: separators folded, only the last
 * piece kept, whitespace and trailing dots stripped. `'..'` cleans to `''`, so a file called `..`
 * ends up `unnamed` rather than becoming a path segment.
 *
 * The shared half of the segment grammar: `sanitiseFolderSegment` below is its exported face with
 * `''` mapped to `null`, and `displayName` in `./uploadPlan.ts` runs walked file names through it
 * before anything else judges them. Sitting beside `sanitiseFolderSegment` now — in the single
 * original it sat in the diff section and relied on hoisting. Exported for exactly that one
 * sibling; NOT re-exported by the barrel. */
export function sanitiseSegment(raw: string): string {
  const parts = raw.replace(/\\/g, NINA_FOLDER_SEPARATOR).split(NINA_FOLDER_SEPARATOR)
  const last = parts.at(-1)
  if (last == null) return ''
  return last.trim().replace(/[.\u0020]+$/, '')
}

/**
 * One folder-name segment as a human typed it, cleaned to something storable — or `null` when
 * nothing usable is left.
 *
 * The exported face of `sanitiseSegment` above, and it exists for phase 6's rename and
 * "new subfolder" boxes: a name typed into a text field is exactly the input `normaliseFolderPath`
 * was written for, but a caller who has one *segment* wants to know whether it survived, and `''`
 * is a worse answer than `null` for that — `null` forces the branch, and phase 6's planner turns
 * it into a sentence the operator can read instead of a field error.
 *
 * `'..'`, `'.'`, `'   '`, `'...'` and a name that is only trailing dots and spaces all clean to
 * `null`. A name carrying a separator keeps only its last piece, which is deliberate: someone who
 * types `Trips/Bali` into a "folder name" box means `Bali` inside the parent they were on, and the
 * alternative is refusing a paste. It does NOT check `NINA_FOLDER_FORBIDDEN_RE` or any bound —
 * that is `validateFolderPath`'s job on the assembled path, and doing it in two places is how the
 * two answers come to differ.
 */
export function sanitiseFolderSegment(raw: string): string | null {
  const segment = sanitiseSegment(raw)
  return segment === '' ? null : segment
}
