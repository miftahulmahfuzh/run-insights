/**
 * The file manager's decisions, made before anything touches the network. R1.
 *
 * `/admin/nina` becomes a file manager: nested folders, a directory picker, a folder dragged out of
 * Windows Explorer, and — the user's own word for it — the *optimisation* that it
 * "automatically upload only the new folders and files". Every one of those is a decision about a
 * list of files, and every one of them lives here rather than in the component that renders the
 * result.
 *
 * ── WHY THIS IS A LIBRARY AND NOT PART OF THE EXPLORER ────────────────────────────────────────
 * Invariant 6, and it is measured rather than preferred. `vitest.config.ts` runs
 * `environment: 'node'` with no jsdom and this repo has no component tests by design, so logic
 * inside a `.tsx` is logic that cannot be asserted at all. Worse, F17 recorded what happens when an
 * upload decides in place: `onPick` chose from INSIDE a `setTiles` updater, `reactStrictMode: true`
 * double-invoked the updater in dev, and one picked file minted two upload tokens, wrote two blobs
 * and left one orphaned in the store for good — one file, one tile, two objects billed. See
 * `docs/plans/F17-onpick-purity.md` and `planNinaPicked` in `lib/nina/images.ts`, whose header says
 * the same thing in fewer words: decide here, hand `setState` a value, run the effects afterwards.
 * A drop of three hundred files is that bug multiplied by three hundred.
 *
 * ── WHY IT HAS NO IMPORTS AT ALL ──────────────────────────────────────────────────────────────
 * Its readers are a `'use client'` explorer, a `'use server'` action module, a Route Handler and
 * the unit suite. `lib/nina/images.ts:5-7` records what one server-side import costs in that
 * situation ("one import of anything server-side and the client half of this phase stops
 * compiling"), and `lib/nina/album.ts:8-11` gets away with a single TYPE import only because a type
 * erases. This file needs neither, so it has neither. **Do not add one.** In particular do not
 * import `lib/admin/avatars.ts` for the byte cap — see `planFolderUpload`, which takes it as an
 * argument precisely so the cap keeps its one definition.
 *
 * ── WHY THE ROW SHAPES ARE DECLARED HERE INSTEAD OF IMPORTED FROM `lib/db` ────────────────────
 * The `AvatarLike` idiom (`lib/nina/album.ts:88-110`), for the reason `lib/nina/attach.ts:14-17`
 * gives: the pure module states what it NEEDS, and the query happens to return something
 * assignable to it, so a column rename is a compile error at one call site rather than an edit
 * here. It also means this file was written at the same time as the migration that adds the
 * columns, with no coupling between the two.
 *
 * ── WHY FOLDERS ARE A PATH AND NOT A BLOB PREFIX ──────────────────────────────────────────────
 * Decided in the plan's Scope: blob layout stays flat (`nina/<userId>/avatar-<id>.<ext>`) and the
 * folder is a column. So renaming a folder is one UPDATE instead of an O(files) copy-and-delete of
 * bytes, and moving a photo copies nothing. The consequence this module has to own is that a folder
 * exists *because rows are filed in it*: an empty folder in a dropped tree has nowhere to be
 * recorded and does not survive the upload. `planFolderUpload` returns `folders` for exactly the
 * folders its own rows will bring into existence, and nothing else.
 */

/* ── Bounds ───────────────────────────────────────────────────────────────────────────────── */

/**
 * The album root, as a folder path. The empty string rather than `'/'` or `null`, so that
 * `folder` is a plain non-null `text` column with a `''` default, `?folder=` in a URL is simply
 * absent for the root, and `joinFolderPath('', x) === x` without a special case anywhere.
 */
export const NINA_FOLDER_ROOT = ''

/**
 * What the root is CALLED. Rendered by the breadcrumb, which is why it is a constant in `lib/` and
 * not a string in a component — `NINA_ALBUM_LABEL` in `lib/nina/album.ts` is the precedent for a
 * label living beside the model it labels. `/admin` copy is English (see
 * `components/admin/AlbumManager.tsx:233`), unlike `components/nina/**`.
 */
export const NINA_FOLDER_ROOT_LABEL = 'Album'

/** One separator, in one place. Windows `\` is converted to this on the way in, never out. */
export const NINA_FOLDER_SEPARATOR = '/'

/**
 * How deep a folder may be nested. Eight is well past what a photo library needs
 * (`Faces/2026/08/studio` is four) and it bounds the recursion in `buildTree` and the work in
 * `folderAncestors`. It is a REFUSAL and not a truncation: silently flattening level nine would
 * merge two folders the user believes are different.
 */
export const NINA_FOLDER_MAX_DEPTH = 8

/** One folder name. 64 is longer than any real one and short enough to render in a tree pane. */
export const NINA_FOLDER_MAX_SEGMENT_CHARS = 64

/**
 * The whole path. Deliberately BELOW `MAX_DEPTH * MAX_SEGMENT_CHARS + separators` (8*64+7 = 519),
 * so on pathological input the total is the binding constraint while every realistic tree fits.
 *
 * The number comes from phase 5's `?folder=` searchParam rather than from storage: `folder` is a
 * Postgres `text` column with no length reason to care. Percent-encoded worst case is 3 bytes per
 * character, so 512 chars is ~1536 bytes of query string, which leaves room under the ~2000-char
 * practical URL limit for the origin, the path and a page cursor.
 */
export const NINA_FOLDER_MAX_PATH_CHARS = 512

/**
 * A file's own name, which becomes `nina_avatars.filename` and the tail of the dedupe key.
 * Generous for anything a camera or an export produces, and it keeps the dedupe key comfortably
 * inside Postgres's ~2704-byte btree index-entry limit (see `NINA_SOURCE_KEY_MAX_CHARS`).
 */
export const NINA_FILENAME_MAX_CHARS = 200

/**
 * What a folder segment or a filename may not contain: C0 controls, DEL, and Windows's reserved
 * set minus the two separators this module has already normalised away (`/` is the separator and
 * `\` was converted to it). The user drags from Windows Explorer, so these cannot occur in a
 * *walked* name — the check exists for a name TYPED into phase 6's rename box, and for a pasted
 * absolute path like `C:\Users\me\Pics`, whose `C:` segment this refuses rather than storing.
 *
 * `#`, `%`, `&`, `+` and `?` are deliberately allowed: `encodeURIComponent` handles all of them
 * and a folder called `Race & Recovery` is a reasonable thing to want.
 *
 * NO `g` FLAG. A global regex reused with `.test` carries `lastIndex` between calls and starts
 * answering `false` to inputs it just rejected; this one is stateless on purpose.
 */
export const NINA_FOLDER_FORBIDDEN_RE = /[\u0000-\u001f\u007f<>:"\\|?*]/

/**
 * The dedupe key's format version, and the reason it exists: the key is STORED, in a column under
 * a unique index, and compared as a string by the server. Change how it is derived and every
 * existing row's key becomes unrecognisable — the next drop of an already-uploaded folder would
 * re-upload all of it. The prefix makes that a visible, deliberate migration instead of a silent
 * double-upload, which is the same reason `lib/extract/constants.ts` splits its request and stored
 * pathname patterns rather than trusting one to keep meaning the other.
 */
export const NINA_SOURCE_KEY_VERSION = 'v1'

/**
 * A bound phase 4's Zod schema can use on the key it receives. Worst case is
 * `'v1|'` (3) + size digits (16) + `'|'` + epoch-second digits (11) + `'|'` +
 * `NINA_FOLDER_MAX_PATH_CHARS` (512) + `'/'` + `NINA_FILENAME_MAX_CHARS` (200) = 745, rounded up.
 * Far inside Postgres's ~2704-byte btree index-entry limit, which is the constraint that matters
 * because phase 1 puts this column in a unique index.
 */
export const NINA_SOURCE_KEY_MAX_CHARS = 800

/* ── "Only upload image files" ────────────────────────────────────────────────────────────── */

/**
 * The three containers the upload path can actually accept. Structurally identical to
 * `ADMIN_AVATAR_EXTS` / `ADMIN_AVATAR_CONTENT_TYPES` in `lib/admin/avatars.ts:31-36`, and NOT
 * imported from there, because this file is zero-import (see the header).
 *
 * The duplication is safe for two reasons, both enforced rather than hoped for. First, `tsc`:
 * phase 4 passes `plan.ext` straight into `adminAvatarPathname(userId, id, ext)`, which is typed
 * `AdminAvatarExt`, so the two unions only compile while they agree — a divergence is a build
 * error at the call site, not a runtime surprise. Second, `tests/admin.filetree.test.ts` asserts
 * the two sets are equal, which is exactly the mechanism ruling A6 uses in `lib/nina/images.ts`
 * where phase 12 spells `nina/` inline and "asserts the two agree in a test that imports this
 * constant".
 */
export type NinaImageExt = 'jpg' | 'png' | 'webp'
export type NinaImageContentType = 'image/jpeg' | 'image/png' | 'image/webp'

interface UploadableImage {
  ext: NinaImageExt
  contentType: NinaImageContentType
}

/**
 * Extension -> what we would upload it as. The aliases are not decoration: `.jpeg` is the common
 * spelling, `.jpe` and `.jfif` come out of old Windows tooling and IrfanView exports, and a folder
 * of family photos assembled over fifteen years has all four in it.
 */
const UPLOADABLE_BY_EXT: Readonly<Record<string, UploadableImage>> = {
  jpg: { ext: 'jpg', contentType: 'image/jpeg' },
  jpeg: { ext: 'jpg', contentType: 'image/jpeg' },
  jpe: { ext: 'jpg', contentType: 'image/jpeg' },
  jfif: { ext: 'jpg', contentType: 'image/jpeg' },
  png: { ext: 'png', contentType: 'image/png' },
  webp: { ext: 'webp', contentType: 'image/webp' },
}

/**
 * MIME -> what we would upload it as. `image/jpg` is not a registered type and Windows writes it
 * anyway; `image/pjpeg` and `image/x-png` are IE-era registry values that still surface from a
 * Windows shell drag. Accepting them is one line and refusing them looks, to the user, like the
 * page rejected a JPEG.
 */
const UPLOADABLE_BY_MIME: Readonly<Record<string, UploadableImage>> = {
  'image/jpeg': { ext: 'jpg', contentType: 'image/jpeg' },
  'image/jpg': { ext: 'jpg', contentType: 'image/jpeg' },
  'image/pjpeg': { ext: 'jpg', contentType: 'image/jpeg' },
  'image/png': { ext: 'png', contentType: 'image/png' },
  'image/x-png': { ext: 'png', contentType: 'image/png' },
  'image/webp': { ext: 'webp', contentType: 'image/webp' },
}

/**
 * Extensions we RECOGNISE as images and still cannot take. They get their own rejection reason so
 * the explorer can say "4 files skipped: unsupported format (.heic)" instead of silently dropping
 * a quarter of an iPhone folder — which is what a single `not_an_image` bucket would have done, and
 * which the user would have read as data loss.
 *
 * `svg` is on this list on purpose rather than by omission: an SVG is an image that can carry
 * script, and `createImageBitmap` on one is inconsistent across browsers, so it is a refusal with a
 * reason and not an oversight.
 */
const RECOGNISED_UNSUPPORTED_EXTS: ReadonlySet<string> = new Set([
  'gif',
  'bmp',
  'tif',
  'tiff',
  'heic',
  'heif',
  'avif',
  'jxl',
  'svg',
  'ico',
  'psd',
  'jp2',
  'tga',
  'raw',
  'dng',
  'cr2',
  'cr3',
  'nef',
  'arw',
  'orf',
  'rw2',
])

/**
 * MIME values that mean "I do not know", as opposed to "not an image".
 *
 * **This set is the whole reason `classifyFile` has an extension fallback at all.** A `File`
 * handed over by `DataTransferItem.webkitGetAsEntry()` and `FileSystemFileEntry.file()` is
 * assembled by the browser from the OS shell, and for an extension the shell has no registry entry
 * for — very much including `.webp` on older Windows installs — `type` arrives as the empty string
 * or as `application/octet-stream`. Trusting a bare MIME check there would silently skip real
 * photographs, i.e. exactly the failure the requirement is about.
 */
const UNDECIDED_MIME: ReadonlySet<string> = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
])

/** Why a file is not going anywhere, when the reason is the file's own kind. */
export type FileRejection = 'not_an_image' | 'unsupported_image'

/**
 * `decidedBy` is carried because it is the one thing worth logging when a folder uploads
 * differently on two machines: `'extension'` means the shell told us nothing and we guessed from
 * the name.
 */
export type FileVerdict =
  | {
      ok: true
      ext: NinaImageExt
      contentType: NinaImageContentType
      decidedBy: 'mime' | 'extension'
    }
  | { ok: false; reason: FileRejection }

/**
 * The lowercased extension without its dot, or `''`.
 *
 * `lastIndexOf('.') <= 0` covers both "no extension" and "dotfile": `.DS_Store` and `.gitignore`
 * have a dot at index 0 and no extension, and treating the leading dot as a separator would make
 * `.DS_Store` a file of type `ds_store`. Windows separators are folded first so a caller may pass a
 * whole relative path instead of a bare name.
 */
export function fileExtension(name: string): string {
  const parts = name.trim().replace(/\\/g, NINA_FOLDER_SEPARATOR).split(NINA_FOLDER_SEPARATOR)
  const base = parts.at(-1)
  if (base == null) return ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

/**
 * *"During uploading, it automatically only upload image files."* This is that sentence.
 *
 * MIME first when the shell said anything decisive, extension only as a fallback — the precedence
 * matters in both directions. A decisive non-image MIME (`text/plain` on a `photo.txt` someone
 * renamed) is NOT overridden by an extension, because the shell knows more than the name does. An
 * undecided MIME (see `UNDECIDED_MIME`) falls through to the extension, because otherwise a real
 * `.webp` off a Windows drag is skipped.
 *
 * When MIME decides, the extension we would upload under is re-derived from the CONTENT TYPE, not
 * from the filename. So `contentType` and `ext` on a verdict always agree, and phase 4 cannot
 * produce a blob called `.png` holding a JPEG.
 *
 * A parameterised type (`image/jpeg; charset=binary`) is trimmed to its media type first; it should
 * never happen for a file, and stripping it costs one `split`.
 */
export function classifyFile(file: { name: string; type: string }): FileVerdict {
  const mime = (file.type.split(';')[0] ?? '').trim().toLowerCase()

  if (!UNDECIDED_MIME.has(mime)) {
    const byMime = UPLOADABLE_BY_MIME[mime]
    if (byMime != null) {
      return { ok: true, ext: byMime.ext, contentType: byMime.contentType, decidedBy: 'mime' }
    }
    if (mime.startsWith('image/')) return { ok: false, reason: 'unsupported_image' }
    return { ok: false, reason: 'not_an_image' }
  }

  const ext = fileExtension(file.name)
  const byExt = UPLOADABLE_BY_EXT[ext]
  if (byExt != null) {
    return { ok: true, ext: byExt.ext, contentType: byExt.contentType, decidedBy: 'extension' }
  }
  if (RECOGNISED_UNSUPPORTED_EXTS.has(ext)) return { ok: false, reason: 'unsupported_image' }
  return { ok: false, reason: 'not_an_image' }
}

/* ── The path grammar ─────────────────────────────────────────────────────────────────────── */

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
 * unable to tell a traversal attempt from an ordinary path. Which is the rule this file lives by:
 * **never store the output of `normaliseFolderPath`. Store the `path` off an `ok`
 * `validateFolderPath` result.**
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
 * so. */
export type FolderPathRejection =
  'too_deep' | 'path_too_long' | 'segment_too_long' | 'bad_segment' | 'traversal'

/** `segment` names the offending piece when there is one, so an error message can quote it. */
export type FolderPathResult =
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
 * the node graph; `planFolderUpload` uses it to report the intermediate folders a drop creates.
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
export interface FolderCrumb {
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
 * One folder-name segment as a human typed it, cleaned to something storable — or `null` when
 * nothing usable is left.
 *
 * The exported face of `sanitiseSegment` below, and it exists for phase 6's rename and
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

/* ── The dedupe key ───────────────────────────────────────────────────────────────────────── */

/**
 * *"It automatically upload only the new folders and files as optimization."* This string is how
 * that question gets answered, and it is deliberately ONE string so that the client derives it and
 * the server merely compares text — no tuple, no composite index, no second opinion about what
 * "the same file" means.
 *
 * ── WHY (PATH, SIZE, MTIME) AND NOT A CONTENT HASH ────────────────────────────────────────────
 * The analysis states it: a browser reads all three off a `File` for free, and hashing hundreds of
 * megabytes to answer "have I seen this?" costs more than the upload it saves. The cost of being
 * wrong is also asymmetric and mild — a false "new" re-uploads one file, and a false "seen" skips
 * one file the user can rename to force through.
 *
 * ── WHY THE PATH GOES LAST ────────────────────────────────────────────────────────────────────
 * `v1|<size>|<epochSeconds>|<folded relative path>`. Size and epoch-seconds are digits only, so
 * the first two separators are unambiguous and everything after them is the path *whatever it
 * contains* — a `|` in a filename cannot shift a field. (`NINA_FOLDER_FORBIDDEN_RE` also refuses
 * `|`, so this is belt and braces; the format is robust on its own so that the two defences do not
 * depend on each other.)
 *
 * ── WHY WHOLE SECONDS ─────────────────────────────────────────────────────────────────────────
 * `File.lastModified` is milliseconds, but the underlying timestamp survives a copy between
 * filesystems at wildly different granularities (FAT32 rounds to 2 s, and shells round differently
 * again), so sub-millisecond fidelity buys nothing and costs a spurious re-upload of an entire
 * folder that was copied via a USB stick. Whole seconds cost nothing in discrimination: two
 * different files at the same path with the same byte count in the same second is not a case that
 * occurs.
 *
 * Non-finite or negative inputs fold to `0` rather than producing `NaN` in a stored key.
 */
export function sourceKeyFor(input: {
  folder: string
  filename: string
  size: number
  lastModified: number
}): string {
  const folder = foldFolderPath(normaliseFolderPath(input.folder))
  const filename = input.filename.trim().toLowerCase()
  const relative =
    folder === NINA_FOLDER_ROOT ? filename : `${folder}${NINA_FOLDER_SEPARATOR}${filename}`
  const size = Number.isFinite(input.size) ? Math.max(0, Math.trunc(input.size)) : 0
  const seconds = Number.isFinite(input.lastModified)
    ? Math.max(0, Math.floor(input.lastModified / 1000))
    : 0
  return `${NINA_SOURCE_KEY_VERSION}|${size}|${seconds}|${relative}`
}

/* ── The diff ─────────────────────────────────────────────────────────────────────────────── */

/**
 * One walked file, as the explorer already has it.
 *
 * `relativePath` is `File.webkitRelativePath`'s value verbatim — **the path INCLUDING the file's
 * own name**, e.g. `Faces/2026/a.jpg` — so the directory picker needs no adapter at all, and
 * phase 5's `webkitGetAsEntry` walk only has to assemble the same shape. It is `''` for a file
 * picked without a directory, which resolves to the base folder with no special case.
 *
 * The browser-API half — `readEntries()` batching, and the loop that must run until it returns an
 * empty array — is phase 5's problem, not this module's. By the time a file reaches here it is
 * already five plain fields.
 */
export interface LocalFileLike {
  relativePath: string
  name: string
  type: string
  size: number
  lastModified: number
}

/**
 * One row of phase 1's folder manifest, structurally (the `AvatarLike` idiom).
 *
 * `sourceKey` is nullable because rows written before phase 1's migration have no key, and a row
 * with no key must not make the diff throw or match — it is simply invisible to it, which means the
 * worst an old album can do is let one already-uploaded file upload a second time. Phase 1's
 * unique index on `(user_id, source_key)` is the backstop for the double-submit case; this is the
 * cheap client-side pass that stops three hundred needless PUTs before they happen.
 */
export interface ManifestEntryLike {
  sourceKey: string | null
}

/** An image we could have taken and will not. Shares every folder-path reason, because the
 * destination folder is part of what a file is. */
export type UploadRefusal =
  FolderPathRejection | 'too_large' | 'empty_file' | 'unnamed' | 'name_too_long'

/**
 * Why a file is in `existing`. Two reasons, one bucket: a row with this key WILL exist after the
 * batch, whether it exists already or is an earlier entry in this same drop.
 *
 * `'duplicate_in_batch'` is not hypothetical — dropping two overlapping folders in one gesture, or
 * the same folder twice, produces it, and uploading both would collide on phase 1's unique index
 * and waste a blob for the loser. Distinguishing the two reasons costs one union member and lets
 * phase 5 report "already in the album" separately from "you dropped it twice".
 */
export type ExistingReason = 'already_uploaded' | 'duplicate_in_batch'

/**
 * A file that is going up. `source` is the caller's own object, handed straight back, so phase 5
 * can hang the real `File` on its input and read it off the plan — the planner never touches a
 * `File`, an `ArrayBuffer` or an object URL, which is what keeps every case in the unit suite
 * deterministic with no test doubles (`tests/extract.planPicked.test.ts:23-25` makes the same
 * point about `planPicked`).
 *
 * `ext` and `contentType` always agree (see `classifyFile`). `folder` is the canonical DESTINATION
 * in display casing, already validated.
 */
export interface PlannedUpload<T> {
  source: T
  folder: string
  filename: string
  ext: NinaImageExt
  contentType: NinaImageContentType
  size: number
  lastModified: number
  sourceKey: string
}

/** A file that is not. `name` is the best display name we could derive, so the UI never has to
 * re-derive one. */
export interface SkippedFile<T, R> {
  source: T
  name: string
  reason: R
}

export interface FolderUploadPlan<T> {
  upload: PlannedUpload<T>[]
  existing: SkippedFile<T, ExistingReason>[]
  rejected: SkippedFile<T, FileRejection>[]
  refused: SkippedFile<T, UploadRefusal>[]
  /**
   * The folders this batch brings into existence, shallowest first, excluding the base it was
   * dropped into — exactly the folders that `upload`'s rows will create.
   *
   * **An empty directory in the dropped tree appears nowhere**, and that is a browser-API limit
   * rather than a schema one: a drop hands over a flat list of FILES, so a directory with nothing
   * in it is not something this function is ever told about. (Empty folders themselves ARE durable
   * — `nina_folders`, phase 1 — but only *"New subfolder"* can create one, because only that path
   * knows the folder is meant to exist.)
   */
  folders: string[]
  counts: {
    total: number
    upload: number
    existing: number
    rejected: number
    refused: number
  }
}

/**
 * Compare two paths by their folded form, falling back to the raw form so the order is total.
 *
 * Plain `<`/`>` and not `localeCompare`: `localeCompare` with no locale argument reads the host's,
 * so the same tree would sort differently on two machines and the unit suite could not assert an
 * order at all. It is lexicographic rather than natural, so `Folder 10` sorts before `Folder 2` —
 * a known, deliberate limitation, filed as a handoff rather than solved with a collator.
 */
function compareFolded(a: string, b: string): number {
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
 * Module-private; `sanitiseFolderSegment` above is the exported face of it, with `''` mapped to
 * `null`. It is referenced from up there and declared down here, which is legal because a
 * `function` declaration hoists — the order below groups it with the diff that uses it most. */
function sanitiseSegment(raw: string): string {
  const parts = raw.replace(/\\/g, NINA_FOLDER_SEPARATOR).split(NINA_FOLDER_SEPARATOR)
  const last = parts.at(-1)
  if (last == null) return ''
  return last.trim().replace(/[.\u0020]+$/, '')
}

/** The file's own name, falling back to the tail of its relative path — a walked entry can arrive
 * with an empty `name` even though the path it was found at names it perfectly well. */
function displayName(file: LocalFileLike): string {
  const direct = sanitiseSegment(file.name)
  if (direct !== '') return direct
  return sanitiseSegment(splitFolderPath(normaliseFolderPath(file.relativePath)).at(-1) ?? '')
}

/**
 * **The requirement's optimisation, in one pure function.** *"It would be perfect if i can drag and
 * drop existing folders, and it automatically upload only the new folders and files as
 * optimization."*
 *
 * Partitions a walked folder into four buckets, in this order per file, because the buckets get
 * different treatment in the UI and the order decides which one a file lands in:
 *
 *   1. **name** — a file with no derivable name at all is `refused('unnamed')`.
 *   2. **kind** — `classifyFile`. `Thumbs.db`, `desktop.ini` and `.DS_Store` are in every Windows
 *      folder and belong in `rejected`, which the explorer swallows silently. This is deliberately
 *      ahead of the path and size checks: a `Thumbs.db` inside a nine-deep folder must read as
 *      "not an image", not as "too deep", or the user is told his tree is malformed when it is
 *      merely ordinary.
 *   3. **shape** — name length, forbidden characters, and the destination folder through
 *      `validateFolderPath`. `refused`, with the reason, which the explorer REPORTS.
 *   4. **bytes** — zero-length (a broken copy; the blob would fail to decode) and over the cap.
 *   5. **novelty** — the dedupe key against the manifest, then against this same batch.
 *
 * ── `maxBytes` IS A PARAMETER AND NOT A CONSTANT HERE ─────────────────────────────────────────
 * `ADMIN_AVATAR_MAX_UPLOAD_BYTES` already exists, argued, at `lib/admin/avatars.ts:43`, and this
 * file is zero-import. Declaring an 8 MB here would be the second spelling of a number that
 * `lib/admin/avatars.ts:8-11` explicitly warns about: *"a constant that is agreed rather than
 * shared is a constant that will one day disagree."* So the caller imports the one definition and
 * passes it, and the byte cap keeps exactly one home.
 *
 * ── `base` ────────────────────────────────────────────────────────────────────────────────────
 * The folder the drop landed in — phase 5's `?folder=`. Every walked directory is placed underneath
 * it, which is why the diff compares the right keys: the same folder dropped at the root and inside
 * `Faces` is genuinely two different sets of files, and a diff that ignored `base` would report the
 * second as "already uploaded".
 *
 * Rejections are returned rather than thrown, and no ordering of the input is assumed or imposed.
 */
export function planFolderUpload<T extends LocalFileLike>(input: {
  base: string
  files: readonly T[]
  manifest: readonly ManifestEntryLike[]
  maxBytes: number
}): FolderUploadPlan<T> {
  const base = normaliseFolderPath(input.base)

  const known = new Set<string>()
  for (const entry of input.manifest) {
    if (entry.sourceKey != null && entry.sourceKey !== '') known.add(entry.sourceKey)
  }

  const upload: PlannedUpload<T>[] = []
  const existing: SkippedFile<T, ExistingReason>[] = []
  const rejected: SkippedFile<T, FileRejection>[] = []
  const refused: SkippedFile<T, UploadRefusal>[] = []
  const planned = new Set<string>()
  /** folded path -> display path, so a folder named twice in two casings appears once. */
  const folders = new Map<string, string>()

  for (const file of input.files) {
    const filename = displayName(file)
    if (filename === '') {
      refused.push({ source: file, name: '', reason: 'unnamed' })
      continue
    }

    const verdict = classifyFile({ name: filename, type: file.type })
    if (!verdict.ok) {
      rejected.push({ source: file, name: filename, reason: verdict.reason })
      continue
    }

    if (filename.length > NINA_FILENAME_MAX_CHARS) {
      refused.push({ source: file, name: filename, reason: 'name_too_long' })
      continue
    }
    if (NINA_FOLDER_FORBIDDEN_RE.test(filename)) {
      refused.push({ source: file, name: filename, reason: 'bad_segment' })
      continue
    }

    const walked = normaliseFolderPath(file.relativePath)
    const target = validateFolderPath(joinFolderPath(base, folderParent(walked)))
    if (!target.ok) {
      refused.push({ source: file, name: filename, reason: target.reason })
      continue
    }

    if (!Number.isFinite(file.size) || file.size <= 0) {
      refused.push({ source: file, name: filename, reason: 'empty_file' })
      continue
    }
    if (file.size > input.maxBytes) {
      refused.push({ source: file, name: filename, reason: 'too_large' })
      continue
    }

    const sourceKey = sourceKeyFor({
      folder: target.path,
      filename,
      size: file.size,
      lastModified: file.lastModified,
    })
    if (known.has(sourceKey)) {
      existing.push({ source: file, name: filename, reason: 'already_uploaded' })
      continue
    }
    if (planned.has(sourceKey)) {
      existing.push({ source: file, name: filename, reason: 'duplicate_in_batch' })
      continue
    }
    planned.add(sourceKey)

    for (const folder of [...folderAncestors(target.path), target.path]) {
      if (!isFolderAncestorOf(base, folder)) continue
      const folded = foldFolderPath(folder)
      if (!folders.has(folded)) folders.set(folded, folder)
    }

    upload.push({
      source: file,
      folder: target.path,
      filename,
      ext: verdict.ext,
      contentType: verdict.contentType,
      size: file.size,
      lastModified: file.lastModified,
      sourceKey,
    })
  }

  const folderList = [...folders.values()].sort((a, b) => {
    const byDepth = folderDepth(a) - folderDepth(b)
    return byDepth !== 0 ? byDepth : compareFolded(a, b)
  })

  return {
    upload,
    existing,
    rejected,
    refused,
    folders: folderList,
    counts: {
      total: input.files.length,
      upload: upload.length,
      existing: existing.length,
      rejected: rejected.length,
      refused: refused.length,
    },
  }
}

/* ── The tree ─────────────────────────────────────────────────────────────────────────────── */

/**
 * A row, as far as counting folders is concerned. Phase 1's tree projection is `(folder, id)`; the
 * id is not read here, because a count is over rows and asking for less is what makes this
 * assignable from any row shape (`AvatarLike` again).
 */
export interface FolderRowLike {
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
 * every empty folder the operator made, which is the whole feature that table exists for. The
 * tests below cover a zero-count entry as INPUT for that reason.
 *
 * Casing: the first spelling encountered wins, for the folder and for every ancestor, and a child's
 * `path` is always built from its parent's RESOLVED path — so a tree fed `Faces/2026` and then
 * `faces/2027` produces `Faces`, `Faces/2026`, `Faces/2027` and never a child whose path
 * contradicts its parent's.
 *
 * Children are sorted by `compareFolded`, which is deterministic and locale-independent (see
 * there). Recursion is bounded in practice by `NINA_FOLDER_MAX_DEPTH`; a hand-written row deeper
 * than that still builds, because this function normalises but does not judge — judging is
 * `validateFolderPath`'s job on the way IN.
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
 * It lives here rather than in the explorer because phase 5 (select a folder) and phase 6 (rename
 * one) would otherwise each write their own fold-comparing lookup, and two spellings of "is this
 * the same folder" is the failure this whole module is arranged to prevent.
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
