# Phase 2: The pure file-tree library — image filter, path grammar, tree build, upload diff

**Plan set:** `ADMIN_ALBUM_FILE_MANAGER_PLAN.md`
**Analysis:** `20260904-131215-A3F7_code_analyzer.md`
**Satisfies:** R1 — `/admin/nina` becomes a file manager. This phase owns the *decisions* inside
that: which dropped files are images, what a folder path may be, what the tree looks like, and —
the requirement's own word — the **optimisation** that "automatically upload only the new folders
and files".
**Depends on:** none
**Difficulty:** NORMAL
**Package:** `lib/admin` (+ `tests`)

---

## Goal

After this phase the repo contains one pure, zero-import module that answers every question the
folder uploader will ask before it touches the network: *is this file an image we can take*, *what
is this folder path in canonical form*, *what does the folder tree look like*, and *which of these
three hundred walked files does the album not already have*. All of it is unit-tested, none of it
is reachable from any component yet, and nothing else in the tree changes.

The reason it is a library and not a `.tsx` is measured, not stylistic. F17
(`docs/plans/F17-onpick-purity.md`) records what happened the last time an upload decided from
inside a `setState` updater: `reactStrictMode: true` double-invoked it, **one picked file minted
two upload tokens, wrote two blobs, and orphaned one in the store for good**. Invariant 6 turned
that into a rule — `vitest.config.ts` is `environment: 'node'` with no jsdom, so UI behaviour worth
testing has to be a pure function in `lib/`. Phase 5 will drop a folder of three hundred files into
a Strict-Mode-double-invoked handler. The decision has to already be a value by then.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none.

**Renames:** none.

**Creates** — all in `lib/admin/filetree.ts` (new file):

*Bounds (values).* These are the folder-path grammar's own bounds and they live with the grammar:

- `NINA_FOLDER_ROOT` (`''`)
- `NINA_FOLDER_ROOT_LABEL` (`'Album'`)
- `NINA_FOLDER_SEPARATOR` (`'/'`)
- `NINA_FOLDER_MAX_DEPTH` (`8`)
- `NINA_FOLDER_MAX_SEGMENT_CHARS` (`64`)
- `NINA_FOLDER_MAX_PATH_CHARS` (`512`)
- `NINA_FILENAME_MAX_CHARS` (`200`)
- `NINA_FOLDER_FORBIDDEN_RE` (`/[\u0000-\u001f\u007f<>:"\\|?*]/`)
- `NINA_SOURCE_KEY_VERSION` (`'v1'`)
- `NINA_SOURCE_KEY_MAX_CHARS` (`800`)

*Types.* `NinaImageExt`, `NinaImageContentType`, `FileRejection`, `FileVerdict`,
`FolderPathRejection`, `FolderPathResult`, `FolderCrumb`, `FolderRowLike`, `FolderCount`,
`FolderNode`, `LocalFileLike`, `ManifestEntryLike`, `UploadRefusal`, `ExistingReason`,
`PlannedUpload<T>`, `SkippedFile<T, R>`, `FolderUploadPlan<T>`.

*Functions.* `fileExtension`, `classifyFile`, `normaliseFolderPath`, `validateFolderPath`,
`foldFolderPath`, `splitFolderPath`, `folderDepth`, `folderName`, `folderParent`,
`joinFolderPath`, `folderAncestors`, `folderBreadcrumbs`, `isFolderAncestorOf`, `isInFolderTree`,
`sanitiseFolderSegment`, `sourceKeyFor`, `planFolderUpload`, `folderCounts`, `buildTree`,
`findFolderNode`.

> **RECONCILED (round 1) — two functions added, and this module is now the repo's ONLY folder-path
> grammar.** `isInFolderTree` and `sanitiseFolderSegment` were not in the draft; phase 6 needed
> both and had written its own copies in a `lib/admin/folderPath.ts` that the reconciler deleted.
> They land here rather than there because this module already holds every primitive they are built
> from, is zero-import, and is the one that has a test suite. Phase 6's whole argument for the split
> survives intact — *nothing under `components/` in this repo reaches `zod`*, and a module-level
> `z.object(...)` is a side effect no bundler removes — it is just satisfied by `filetree.ts`
> instead of by a fourth module. Phase 1's `lib/admin/avatars.ts` declares no folder bounds and no
> validator; phase 4's `folderPathSchema` wraps `validateFolderPath`; phase 6 imports the path
> arithmetic from here. Two definitions of `NINA_FOLDER_MAX_DEPTH` was the merge outcome this
> phase's handoff said must not ship, and it does not.

**Creates:** `tests/admin.filetree.test.ts` (new file).

**Signature changes:** none.

**Requires (from earlier phases):** nothing. This phase has no `depends_on` and imports nothing
from any other phase's file. It runs concurrently with phases 1 and 3 by construction.

**Requires (from *later* phases, i.e. what they must do to consume this):**

1. **`planFolderUpload` takes `maxBytes` as a required parameter and declares no byte cap of its
   own.** `ADMIN_AVATAR_MAX_UPLOAD_BYTES = 8 * 1024 * 1024` already exists at
   `lib/admin/avatars.ts:43`, and this repo's own rule (`lib/admin/avatars.ts:8-11`) is that *"a
   constant that is agreed rather than shared is a constant that will one day disagree"*. Phase 5's
   caller imports it and passes it in. **Nobody may add a second byte cap to `filetree.ts`.**
2. **The folder-path bounds above are the only definition — SETTLED.** Phase 1 no longer declares
   `ADMIN_FOLDER_MAX_DEPTH / _SEGMENT / _PATH`, `ADMIN_FILENAME_MAX`, `ADMIN_SOURCE_KEY_MAX`,
   `ADMIN_FOLDER_SEGMENT_RE` or `isAdminAvatarFolderPath`, and does not re-export them either — a
   re-export is a second name for one value, which is the thing `lib/admin/avatars.ts`'s own header
   argues against. Phase 6's `lib/admin/folderPath.ts` is deleted and its callers import from here.
3. **Phase 4's Zod folder-path schema is `validateFolderPath`, not a second regex — SETTLED.**
   `folderPathSchema` is `z.string().max(NINA_FOLDER_MAX_PATH_CHARS).refine(canonical)`, where
   `canonical(v)` is `validateFolderPath(v)` succeeding **with `result.path === v`**. The identity
   check is what preserves phase 1's separate and correct point: the server must REFUSE a
   non-canonical path rather than repair it, because a server that repairs what a client sent has
   no way left to notice that the client sent something it should not have. One grammar, one
   enforcer, and the canonical-form rule intact.
4. **Phase 1's `source_key` column must be `text` and nullable, and its unique index must be
   `(user_id, source_key)`.** `planFolderUpload` tolerates `sourceKey: null` on manifest rows
   (pre-migration rows have no key) by ignoring them, which is what makes the diff safe to run
   against an album that predates phase 1.
5. **Phase 1's `folder` column defaults to `''`, not `NULL`, and phase 1's manifest/tree queries
   may still return `null`.** `NINA_FOLDER_ROOT` is `''`; `folderCounts` and `buildTree` accept
   `string | null` and fold `null` to the root, so either choice compiles and behaves.

**Leaves alone (owned by others):** `lib/db/schema.ts`, `drizzle/**`, `lib/nina/queries.ts`,
`lib/admin/avatars.ts`, `lib/nina/album.ts` (phase 1); `lib/nina/attach.ts`, `app/nina/**`,
`components/nina/**` (phase 3); `lib/admin/schema.ts`, `app/api/admin/nina/upload/route.ts`,
`lib/admin/ninaAlbumActions.ts` (phase 4); `components/admin/**`, `app/admin/**` (phases 5–7).

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/admin/filetree.ts` | create | the whole module: bounds, image filter, path grammar, dedupe key, `planFolderUpload`, `folderCounts`/`buildTree`, breadcrumb + ancestor helpers |
| `tests/admin.filetree.test.ts` | create | the diff, the path grammar, the Windows-separator cases, the empty-MIME fallback, the boundary cases of every bound, and the ruling-A6-style assertion that this file's ext/content-type unions still agree with `lib/admin/avatars.ts` |

Both are new files, so the "line reference" for each step is a section of the file being created,
given below in order. The *precedents* each step follows are cited with real line references.

---

## Implementation Steps

### Step 1: Create `lib/admin/filetree.ts` — the whole module, in one file, in one commit

**File:** `lib/admin/filetree.ts:1` (new file)

**Change:** Write the module below verbatim. It is presented as one block because it must land as
one file; the sections inside it are ordered bounds → image filter → path grammar → dedupe key →
diff → tree → helpers, and each carries the argument for its own decisions in the density
`lib/nina/album.ts:3-19` and `lib/nina/attach.ts:3-17` set.

Three properties of this file are load-bearing and are stated in its own header so they cannot be
lost in a later edit:

- **Zero imports, not even a type import.** `lib/nina/album.ts:1` gets away with
  `import type { NinaCropInput }` because a type erases; this file needs nothing at all, and
  keeping it at zero is stronger. Its readers are a `'use client'` explorer (phase 5), a
  `'use server'` action module (phase 4), a Route Handler (phase 4) and the unit suite. One import
  of anything server-side and phase 5 stops compiling — the exact failure `lib/nina/images.ts:5-7`
  documents.
- **Row shapes are declared structurally, never imported from `lib/db`.** `AvatarLike` /
  `ImageLike` at `lib/nina/album.ts:88-110` and `RunAttachmentInput` at `lib/nina/attach.ts:13-17`
  are the idiom, and `lib/nina/attach.ts:14-17` states the reason: *"the pure module states what it
  needs, and the query happens to return something assignable to it. A column rename is then a
  compile error at one call site rather than a change to this file."* It is also what lets this
  phase run at the same time as phase 1.
- **Nothing here throws.** Every rejection is a returned value. Three of four files in a dropped
  folder being fine is the normal outcome, not an error — `planNinaPicked` in `lib/nina/images.ts`
  made the same call for the same reason.

**Code:**

```ts
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
  | 'too_deep'
  | 'path_too_long'
  | 'segment_too_long'
  | 'bad_segment'
  | 'traversal'

/** `segment` names the offending piece when there is one, so an error message can quote it. */
export type FolderPathResult =
  | { ok: true; path: string }
  | { ok: false; reason: FolderPathRejection; segment: string | null }

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
  | FolderPathRejection
  | 'too_large'
  | 'empty_file'
  | 'unnamed'
  | 'name_too_long'

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
```

**Impact:** Nothing. No existing file imports it, so `npm run build`, every route and every other
suite behave exactly as before. `npm run typecheck` covers it because `tsconfig.json`'s `include`
is `**/*.ts`.

---

### Step 2: Create `tests/admin.filetree.test.ts` — the diff, the grammar, and every boundary

**File:** `tests/admin.filetree.test.ts:1` (new file)

**Change:** Write the suite below verbatim. It is the phase's exit criteria made executable, and it
covers the five things the phase scope singles out — the diff, the path grammar, the Windows
separator cases, the empty-MIME fallback, and the boundary cases of the depth and length bounds —
plus the ruling-A6 agreement assertion against `lib/admin/avatars.ts`.

Two deliberate choices in the test file itself:

- **It imports `lib/admin/avatars.ts`.** The module under test may not, but the test may and must:
  the `ADMIN_AVATAR_EXTS` / `ADMIN_AVATAR_CONTENT_TYPES` agreement assertion is the mechanism
  ruling A6 already uses in `lib/nina/images.ts` for `NINA_BLOB_PREFIX`. It also imports
  `ADMIN_AVATAR_MAX_UPLOAD_BYTES` and passes it as `maxBytes`, so the suite exercises the real
  number the explorer will pass rather than a made-up one.
- **No `File`, no `Blob`, no test double anywhere.** `tests/extract.planPicked.test.ts:23-25` needed
  `Object.defineProperty` to fake a 40 MB `File`; `planFolderUpload` takes five plain fields, so
  every case here is a literal.

**Code:**

```ts
import { describe, expect, it } from 'vitest'

import {
  ADMIN_AVATAR_CONTENT_TYPES,
  ADMIN_AVATAR_EXTS,
  ADMIN_AVATAR_MAX_UPLOAD_BYTES,
} from '@/lib/admin/avatars'
import {
  buildTree,
  classifyFile,
  fileExtension,
  findFolderNode,
  folderAncestors,
  folderBreadcrumbs,
  folderCounts,
  folderDepth,
  folderName,
  folderParent,
  foldFolderPath,
  isFolderAncestorOf,
  isInFolderTree,
  joinFolderPath,
  normaliseFolderPath,
  NINA_FILENAME_MAX_CHARS,
  NINA_FOLDER_MAX_DEPTH,
  NINA_FOLDER_MAX_PATH_CHARS,
  NINA_FOLDER_MAX_SEGMENT_CHARS,
  NINA_FOLDER_ROOT,
  NINA_FOLDER_ROOT_LABEL,
  NINA_SOURCE_KEY_MAX_CHARS,
  NINA_SOURCE_KEY_VERSION,
  planFolderUpload,
  sanitiseFolderSegment,
  sourceKeyFor,
  splitFolderPath,
  validateFolderPath,
  type FolderCount,
  type LocalFileLike,
  type ManifestEntryLike,
} from '@/lib/admin/filetree'

/**
 * Phase 2 of the album-as-a-file-manager plan set: everything `/admin/nina`'s uploader decides
 * before it touches the network. R1.
 *
 * These are unit tests for logic that would otherwise live in a drop handler, and that is not a
 * style choice: `vitest.config.ts` is `environment: 'node'` with no jsdom, so logic inside a `.tsx`
 * is logic this repo cannot assert at all — and F17 measured what that costs on an upload path
 * (one picked file, two token mints, two blobs, one orphaned for good). The rules below are small
 * and total, so they are proved case by case rather than by example, the way
 * `tests/extract.planPicked.test.ts` proves `planPicked`.
 *
 * Nothing here constructs a `File`. `planFolderUpload` takes five plain fields precisely so the
 * whole diff is testable with literals and no doubles.
 */

/** One walked file. `tag` rides along to prove the plan hands the caller's own object back. */
interface Walked extends LocalFileLike {
  tag?: string
}

function walked(relativePath: string, over: Partial<Walked> = {}): Walked {
  const name = relativePath.split('/').at(-1) ?? relativePath
  return {
    relativePath,
    name,
    type: 'image/jpeg',
    size: 1024,
    lastModified: 1_700_000_000_000,
    ...over,
  }
}

function manifestOf(...keys: string[]): ManifestEntryLike[] {
  return keys.map((sourceKey) => ({ sourceKey }))
}

function plan(base: string, files: readonly Walked[], manifest: readonly ManifestEntryLike[] = []) {
  return planFolderUpload({ base, files, manifest, maxBytes: ADMIN_AVATAR_MAX_UPLOAD_BYTES })
}

const path = (depth: number, chars = 4) =>
  Array.from({ length: depth }, (_, i) => `${String(i).padStart(chars, 'd')}`).join('/')

/* ── The image filter ─────────────────────────────────────────────────────────────────────── */

describe('fileExtension', () => {
  it('lowercases, and takes the last dot only', () => {
    expect(fileExtension('a.JPG')).toBe('jpg')
    expect(fileExtension('holiday.2024.jpeg')).toBe('jpeg')
    expect(fileExtension('archive.tar.gz')).toBe('gz')
  })

  it('treats a leading dot as part of the name, not as a separator', () => {
    expect(fileExtension('.DS_Store')).toBe('')
    expect(fileExtension('.gitignore')).toBe('')
  })

  it('has no extension when there is no dot', () => {
    expect(fileExtension('README')).toBe('')
    expect(fileExtension('')).toBe('')
  })

  it('accepts a whole relative path, in either separator style', () => {
    expect(fileExtension('Faces/2026/a.png')).toBe('png')
    expect(fileExtension('Faces\\2026\\a.WEBP')).toBe('webp')
  })
})

describe('classifyFile — MIME first', () => {
  it('accepts the three content types the upload path can take', () => {
    expect(classifyFile({ name: 'a', type: 'image/jpeg' })).toEqual({
      ok: true,
      ext: 'jpg',
      contentType: 'image/jpeg',
      decidedBy: 'mime',
    })
    expect(classifyFile({ name: 'a', type: 'image/png' })).toEqual({
      ok: true,
      ext: 'png',
      contentType: 'image/png',
      decidedBy: 'mime',
    })
    expect(classifyFile({ name: 'a', type: 'image/webp' })).toEqual({
      ok: true,
      ext: 'webp',
      contentType: 'image/webp',
      decidedBy: 'mime',
    })
  })

  it('accepts the spellings a Windows shell actually emits', () => {
    for (const type of ['image/jpg', 'image/pjpeg', 'IMAGE/JPEG', 'image/jpeg; charset=binary']) {
      expect(classifyFile({ name: 'a.jpg', type })).toMatchObject({ ok: true, ext: 'jpg' })
    }
    expect(classifyFile({ name: 'a.png', type: 'image/x-png' })).toMatchObject({
      ok: true,
      ext: 'png',
    })
  })

  it('derives the extension from the content type, never from the name', () => {
    expect(classifyFile({ name: 'mislabelled.png', type: 'image/jpeg' })).toMatchObject({
      ext: 'jpg',
      contentType: 'image/jpeg',
    })
  })

  it('lets a decisive non-image MIME override a promising extension', () => {
    expect(classifyFile({ name: 'photo.jpg', type: 'text/plain' })).toEqual({
      ok: false,
      reason: 'not_an_image',
    })
  })

  it('names an image format it cannot take, so the UI can say why', () => {
    expect(classifyFile({ name: 'a.gif', type: 'image/gif' })).toEqual({
      ok: false,
      reason: 'unsupported_image',
    })
    expect(classifyFile({ name: 'a.svg', type: 'image/svg+xml' })).toEqual({
      ok: false,
      reason: 'unsupported_image',
    })
  })
})

describe('classifyFile — the empty-MIME fallback', () => {
  it('falls back to the extension when the shell said nothing', () => {
    for (const type of ['', 'application/octet-stream', 'binary/octet-stream']) {
      expect(classifyFile({ name: 'IMG_0042.JPEG', type })).toEqual({
        ok: true,
        ext: 'jpg',
        contentType: 'image/jpeg',
        decidedBy: 'extension',
      })
      expect(classifyFile({ name: 'shot.webp', type })).toMatchObject({
        ok: true,
        ext: 'webp',
        decidedBy: 'extension',
      })
    }
  })

  it('takes the old JPEG spellings by extension too', () => {
    for (const name of ['a.jpg', 'a.jpeg', 'a.jpe', 'a.jfif']) {
      expect(classifyFile({ name, type: '' })).toMatchObject({ ok: true, ext: 'jpg' })
    }
  })

  it('separates a recognised-but-unsupported image from a non-image', () => {
    for (const name of ['a.heic', 'a.HEIF', 'a.tiff', 'a.dng', 'a.cr2', 'a.avif']) {
      expect(classifyFile({ name, type: '' })).toEqual({ ok: false, reason: 'unsupported_image' })
    }
  })

  it('rejects the litter a Windows folder is full of', () => {
    for (const name of ['Thumbs.db', 'desktop.ini', '.DS_Store', 'notes.txt', 'README', 'a.zip']) {
      expect(classifyFile({ name, type: '' })).toEqual({ ok: false, reason: 'not_an_image' })
    }
  })
})

describe('the ext/content-type unions agree with lib/admin/avatars.ts (ruling A6)', () => {
  it('has exactly the extensions the blob pathname builder accepts', () => {
    const mine = new Set<string>()
    for (const name of ['a.jpg', 'a.png', 'a.webp']) {
      const verdict = classifyFile({ name, type: '' })
      if (verdict.ok) mine.add(verdict.ext)
    }
    expect([...mine].sort()).toEqual([...ADMIN_AVATAR_EXTS].sort())
  })

  it('has exactly the content types the upload token accepts', () => {
    const mine = new Set<string>()
    for (const type of ADMIN_AVATAR_CONTENT_TYPES) {
      const verdict = classifyFile({ name: 'a', type })
      if (verdict.ok) mine.add(verdict.contentType)
    }
    expect([...mine].sort()).toEqual([...ADMIN_AVATAR_CONTENT_TYPES].sort())
  })
})

/* ── The path grammar ─────────────────────────────────────────────────────────────────────── */

describe('normaliseFolderPath', () => {
  it('folds Windows separators, because that is where the folders come from', () => {
    expect(normaliseFolderPath('Faces\\2026\\studio')).toBe('Faces/2026/studio')
    expect(normaliseFolderPath('Faces\\2026/studio')).toBe('Faces/2026/studio')
    expect(normaliseFolderPath('Faces\\')).toBe('Faces')
  })

  it('drops leading, trailing, doubled and empty separators', () => {
    expect(normaliseFolderPath('/a//b/')).toBe('a/b')
    expect(normaliseFolderPath('///')).toBe(NINA_FOLDER_ROOT)
    expect(normaliseFolderPath('')).toBe(NINA_FOLDER_ROOT)
  })

  it('drops "." segments and trims whitespace around every segment', () => {
    expect(normaliseFolderPath('a/./b')).toBe('a/b')
    expect(normaliseFolderPath('  a  /  b  ')).toBe('a/b')
  })

  it('strips the trailing dots and spaces Windows itself cannot represent', () => {
    expect(normaliseFolderPath('Trip 2024. ')).toBe('Trip 2024')
    expect(normaliseFolderPath('a/b.../c')).toBe('a/b/c')
    expect(normaliseFolderPath('a/.../b')).toBe('a/b')
  })

  it('PRESERVES ".." so exactly one function decides its fate', () => {
    expect(normaliseFolderPath('a/../b')).toBe('a/../b')
    expect(normaliseFolderPath('..\\..\\secrets')).toBe('../../secrets')
  })
})

describe('validateFolderPath', () => {
  it('accepts the root and an ordinary path unchanged', () => {
    expect(validateFolderPath('')).toEqual({ ok: true, path: NINA_FOLDER_ROOT })
    expect(validateFolderPath('/Faces/2026/')).toEqual({ ok: true, path: 'Faces/2026' })
    expect(validateFolderPath('Race & Recovery')).toEqual({ ok: true, path: 'Race & Recovery' })
  })

  it('refuses a traversal by its own name', () => {
    expect(validateFolderPath('a/../b')).toEqual({ ok: false, reason: 'traversal', segment: '..' })
    expect(validateFolderPath('../secrets')).toEqual({
      ok: false,
      reason: 'traversal',
      segment: '..',
    })
  })

  it('refuses a pasted absolute Windows path rather than storing its drive letter', () => {
    expect(validateFolderPath('C:\\Users\\me\\Pics')).toEqual({
      ok: false,
      reason: 'bad_segment',
      segment: 'C:',
    })
  })

  it('refuses the reserved characters and control characters', () => {
    for (const bad of ['a<b', 'a>b', 'a"b', 'a|b', 'a?b', 'a*b', 'a\u0000b', 'a\u001fb']) {
      expect(validateFolderPath(bad)).toMatchObject({ ok: false, reason: 'bad_segment' })
    }
  })

  it('accepts exactly MAX_DEPTH and refuses one more', () => {
    expect(validateFolderPath(path(NINA_FOLDER_MAX_DEPTH))).toMatchObject({ ok: true })
    expect(validateFolderPath(path(NINA_FOLDER_MAX_DEPTH + 1))).toEqual({
      ok: false,
      reason: 'too_deep',
      segment: null,
    })
  })

  it('accepts exactly MAX_SEGMENT_CHARS and refuses one more', () => {
    const ok = 'x'.repeat(NINA_FOLDER_MAX_SEGMENT_CHARS)
    expect(validateFolderPath(ok)).toEqual({ ok: true, path: ok })
    const tooLong = 'x'.repeat(NINA_FOLDER_MAX_SEGMENT_CHARS + 1)
    expect(validateFolderPath(tooLong)).toEqual({
      ok: false,
      reason: 'segment_too_long',
      segment: tooLong,
    })
  })

  it('makes the total length the binding bound at full depth', () => {
    const segment = 'x'.repeat(NINA_FOLDER_MAX_SEGMENT_CHARS)
    const maximal = Array.from({ length: NINA_FOLDER_MAX_DEPTH }, () => segment).join('/')
    expect(maximal.length).toBeGreaterThan(NINA_FOLDER_MAX_PATH_CHARS)
    expect(validateFolderPath(maximal)).toEqual({
      ok: false,
      reason: 'path_too_long',
      segment: null,
    })

    const short = 'x'.repeat(NINA_FOLDER_MAX_SEGMENT_CHARS - 1)
    const fits = Array.from({ length: NINA_FOLDER_MAX_DEPTH }, () => short).join('/')
    expect(fits.length).toBeLessThanOrEqual(NINA_FOLDER_MAX_PATH_CHARS)
    expect(validateFolderPath(fits)).toMatchObject({ ok: true })
  })
})

describe('folding and the path helpers', () => {
  it('folds case-insensitively and locale-independently', () => {
    expect(foldFolderPath('Faces/NINA')).toBe('faces/nina')
    expect(foldFolderPath(normaliseFolderPath('Faces\\NINA'))).toBe(
      foldFolderPath(normaliseFolderPath('faces/nina')),
    )
  })

  it('splits, measures and names', () => {
    expect(splitFolderPath('')).toEqual([])
    expect(splitFolderPath('a/b')).toEqual(['a', 'b'])
    expect(folderDepth('')).toBe(0)
    expect(folderDepth('a/b/c')).toBe(3)
    expect(folderName('')).toBe(NINA_FOLDER_ROOT_LABEL)
    expect(folderName('a/b')).toBe('b')
  })

  it('walks up, and stops at the root instead of erroring', () => {
    expect(folderParent('a/b/c')).toBe('a/b')
    expect(folderParent('a')).toBe(NINA_FOLDER_ROOT)
    expect(folderParent(NINA_FOLDER_ROOT)).toBe(NINA_FOLDER_ROOT)
  })

  it('joins with no special case for the root', () => {
    expect(joinFolderPath('', 'a')).toBe('a')
    expect(joinFolderPath('Faces', '')).toBe('Faces')
    expect(joinFolderPath('Faces', '2026\\studio')).toBe('Faces/2026/studio')
    expect(joinFolderPath('', '')).toBe(NINA_FOLDER_ROOT)
  })

  it('lists strict ancestors, shallowest first, root included', () => {
    expect(folderAncestors('a/b/c')).toEqual(['', 'a', 'a/b'])
    expect(folderAncestors('a')).toEqual([''])
    expect(folderAncestors('')).toEqual([])
  })

  it('builds a breadcrumb whose root is a crumb like any other', () => {
    expect(folderBreadcrumbs('Faces/2026')).toEqual([
      { path: '', name: NINA_FOLDER_ROOT_LABEL, depth: 0, isCurrent: false },
      { path: 'Faces', name: 'Faces', depth: 1, isCurrent: false },
      { path: 'Faces/2026', name: '2026', depth: 2, isCurrent: true },
    ])
    expect(folderBreadcrumbs('')).toEqual([
      { path: '', name: NINA_FOLDER_ROOT_LABEL, depth: 0, isCurrent: true },
    ])
  })

  it('does not mistake a name prefix for an ancestor', () => {
    expect(isFolderAncestorOf('a', 'a/b')).toBe(true)
    expect(isFolderAncestorOf('a', 'ab/c')).toBe(false)
    expect(isFolderAncestorOf('A', 'a/b')).toBe(true)
    expect(isFolderAncestorOf('a', 'a')).toBe(false)
    expect(isFolderAncestorOf('', 'a')).toBe(true)
    expect(isFolderAncestorOf('', '')).toBe(false)
    expect(isFolderAncestorOf('a/b', 'a')).toBe(false)
  })

  it('includes the root of the tree in isInFolderTree, unlike the ancestor test', () => {
    // The asymmetry is the whole reason both exist. A recursive delete of `Bali` must take a
    // photo filed exactly at `Bali`; a move of `Bali` into `Bali` is a no-op and not a cycle.
    expect(isInFolderTree('Bali', 'Bali')).toBe(true)
    expect(isFolderAncestorOf('Bali', 'Bali')).toBe(false)
    expect(isInFolderTree('Bali/2024', 'Bali')).toBe(true)
    expect(isInFolderTree('Bali2024', 'Bali')).toBe(false)
    expect(isInFolderTree('Trips', 'Bali')).toBe(false)
    expect(isInFolderTree('BALI\\2024', 'bali')).toBe(true)
  })

  it('makes the album root contain everything, itself included', () => {
    expect(isInFolderTree('', '')).toBe(true)
    expect(isInFolderTree('Trips/Bali', '')).toBe(true)
    expect(isInFolderTree('', 'Trips')).toBe(false)
  })

  it('sanitises one typed segment, and says null when nothing survives', () => {
    expect(sanitiseFolderSegment('  Bali  ')).toBe('Bali')
    expect(sanitiseFolderSegment('Trip 2024. ')).toBe('Trip 2024')
    // A pasted path keeps only its last piece: someone typing `Trips/Bali` into a "folder name"
    // box means `Bali` inside the parent they were on.
    expect(sanitiseFolderSegment('Trips\\Bali')).toBe('Bali')
    for (const nothing of ['', '   ', '.', '..', '...', '. . ']) {
      expect(sanitiseFolderSegment(nothing)).toBeNull()
    }
  })
})

/* ── The dedupe key ───────────────────────────────────────────────────────────────────────── */

describe('sourceKeyFor', () => {
  it('is stable across separator style and casing, because the source is Windows', () => {
    const a = sourceKeyFor({
      folder: 'Faces/Nina',
      filename: 'A.JPG',
      size: 100,
      lastModified: 5000,
    })
    const b = sourceKeyFor({
      folder: 'faces\\nina\\',
      filename: 'a.jpg',
      size: 100,
      lastModified: 5000,
    })
    expect(a).toBe(b)
  })

  it('quantises the timestamp to whole seconds', () => {
    const base = { folder: '', filename: 'a.jpg', size: 100 }
    expect(sourceKeyFor({ ...base, lastModified: 1_700_000_123_000 })).toBe(
      sourceKeyFor({ ...base, lastModified: 1_700_000_123_999 }),
    )
    expect(sourceKeyFor({ ...base, lastModified: 1_700_000_123_000 })).not.toBe(
      sourceKeyFor({ ...base, lastModified: 1_700_000_124_000 }),
    )
  })

  it('distinguishes size, path and folder', () => {
    const base = { folder: 'a', filename: 'x.jpg', size: 100, lastModified: 5000 }
    expect(sourceKeyFor(base)).not.toBe(sourceKeyFor({ ...base, size: 101 }))
    expect(sourceKeyFor(base)).not.toBe(sourceKeyFor({ ...base, filename: 'y.jpg' }))
    expect(sourceKeyFor(base)).not.toBe(sourceKeyFor({ ...base, folder: 'b' }))
  })

  it('puts the path last, so a separator inside a name cannot shift a field', () => {
    const key = sourceKeyFor({ folder: '', filename: 'a|b.jpg', size: 10, lastModified: 5000 })
    expect(key.startsWith(`${NINA_SOURCE_KEY_VERSION}|10|5|`)).toBe(true)
    expect(key.slice(`${NINA_SOURCE_KEY_VERSION}|10|5|`.length)).toBe('a|b.jpg')
  })

  it('never emits NaN, and stays inside the declared bound', () => {
    expect(
      sourceKeyFor({ folder: '', filename: 'a.jpg', size: Number.NaN, lastModified: Number.NaN }),
    ).toBe(`${NINA_SOURCE_KEY_VERSION}|0|0|a.jpg`)
    expect(sourceKeyFor({ folder: '', filename: 'a.jpg', size: -5, lastModified: -5 })).toBe(
      `${NINA_SOURCE_KEY_VERSION}|0|0|a.jpg`,
    )

    const worst = sourceKeyFor({
      folder: 'x'.repeat(NINA_FOLDER_MAX_PATH_CHARS),
      filename: 'y'.repeat(NINA_FILENAME_MAX_CHARS),
      size: Number.MAX_SAFE_INTEGER,
      lastModified: Number.MAX_SAFE_INTEGER,
    })
    expect(worst.length).toBeLessThanOrEqual(NINA_SOURCE_KEY_MAX_CHARS)
  })
})

/* ── The diff: "upload only the new folders and files" ────────────────────────────────────── */

describe('planFolderUpload — the requirement', () => {
  const dropped = [
    walked('Faces/a.jpg'),
    walked('Faces/2026/b.png', { type: 'image/png' }),
    walked('Faces/2026/c.webp', { type: '' }),
  ]

  it('uploads everything the first time, and names the folders it creates', () => {
    const result = plan(NINA_FOLDER_ROOT, dropped)
    expect(result.upload.map((u) => `${u.folder}/${u.filename}`)).toEqual([
      'Faces/a.jpg',
      'Faces/2026/b.png',
      'Faces/2026/c.webp',
    ])
    expect(result.folders).toEqual(['Faces', 'Faces/2026'])
    expect(result.counts).toEqual({ total: 3, upload: 3, existing: 0, rejected: 0, refused: 0 })
  })

  it('uploads NOTHING when the same folder is dropped again', () => {
    const first = plan(NINA_FOLDER_ROOT, dropped)
    const again = plan(
      NINA_FOLDER_ROOT,
      dropped,
      manifestOf(...first.upload.map((u) => u.sourceKey)),
    )
    expect(again.upload).toEqual([])
    expect(again.folders).toEqual([])
    expect(again.existing.map((e) => e.reason)).toEqual([
      'already_uploaded',
      'already_uploaded',
      'already_uploaded',
    ])
    expect(again.counts).toEqual({ total: 3, upload: 0, existing: 3, rejected: 0, refused: 0 })
  })

  it('uploads exactly the new files when the folder grew, and only the new subfolder', () => {
    const first = plan(NINA_FOLDER_ROOT, dropped)
    const grown = [
      ...dropped,
      walked('Faces/2027/d.jpg'),
      walked('Faces/2027/e.jpg'),
      walked('Faces/f.jpg'),
    ]
    const result = plan(
      NINA_FOLDER_ROOT,
      grown,
      manifestOf(...first.upload.map((u) => u.sourceKey)),
    )
    expect(result.upload.map((u) => u.filename)).toEqual(['d.jpg', 'e.jpg', 'f.jpg'])
    expect(result.folders).toEqual(['Faces/2027'])
    expect(result.counts.existing).toBe(3)
  })

  it('treats an edited file as new, because its timestamp moved', () => {
    const first = plan(NINA_FOLDER_ROOT, dropped)
    const edited = [walked('Faces/a.jpg', { lastModified: 1_800_000_000_000 })]
    const result = plan(
      NINA_FOLDER_ROOT,
      edited,
      manifestOf(...first.upload.map((u) => u.sourceKey)),
    )
    expect(result.upload).toHaveLength(1)
  })

  it('ignores manifest rows that predate the dedupe key instead of matching them', () => {
    const result = planFolderUpload({
      base: NINA_FOLDER_ROOT,
      files: dropped,
      manifest: [{ sourceKey: null }, { sourceKey: '' }],
      maxBytes: ADMIN_AVATAR_MAX_UPLOAD_BYTES,
    })
    expect(result.upload).toHaveLength(3)
  })

  it('folds a file dropped twice in one gesture, and says which reason it was', () => {
    const result = plan(NINA_FOLDER_ROOT, [walked('Faces/a.jpg'), walked('Faces/a.jpg')])
    expect(result.upload).toHaveLength(1)
    expect(result.existing.map((e) => e.reason)).toEqual(['duplicate_in_batch'])
  })

  it('files the drop under the folder it landed in', () => {
    const result = plan('Album 2026', [walked('Faces\\2026\\b.png', { type: 'image/png' })])
    expect(result.upload[0]?.folder).toBe('Album 2026/Faces/2026')
    expect(result.folders).toEqual(['Album 2026/Faces', 'Album 2026/Faces/2026'])
  })

  it('does not confuse the same folder dropped at two different bases', () => {
    const atRoot = plan(NINA_FOLDER_ROOT, dropped)
    const nested = plan(
      'Archive',
      dropped,
      manifestOf(...atRoot.upload.map((u) => u.sourceKey)),
    )
    expect(nested.upload).toHaveLength(3)
  })

  it('handles a bare picked file with no relative path at all', () => {
    const result = plan('Faces', [{ ...walked('a.jpg'), relativePath: '' }])
    expect(result.upload[0]?.folder).toBe('Faces')
    expect(result.folders).toEqual([])
  })

  it('hands the caller its own object back, so the File can ride along', () => {
    const result = plan(NINA_FOLDER_ROOT, [walked('a.jpg', { tag: 'the-file' })])
    expect(result.upload[0]?.source.tag).toBe('the-file')
  })
})

describe('planFolderUpload — "only image files", and the refusals', () => {
  it('rejects the non-images silently and by kind, ahead of every other check', () => {
    const result = plan(NINA_FOLDER_ROOT, [
      walked('Faces/a.jpg'),
      walked('Faces/Thumbs.db', { type: '' }),
      walked('Faces/desktop.ini', { type: '' }),
      walked('Faces/.DS_Store', { type: '' }),
      walked('Faces/notes.txt', { type: 'text/plain' }),
      walked('Faces/old.gif', { type: 'image/gif' }),
      walked('Faces/phone.heic', { type: '' }),
    ])
    expect(result.upload.map((u) => u.filename)).toEqual(['a.jpg'])
    expect(result.rejected.map((r) => [r.name, r.reason])).toEqual([
      ['Thumbs.db', 'not_an_image'],
      ['desktop.ini', 'not_an_image'],
      ['.DS_Store', 'not_an_image'],
      ['notes.txt', 'not_an_image'],
      ['old.gif', 'unsupported_image'],
      ['phone.heic', 'unsupported_image'],
    ])
    expect(result.refused).toEqual([])
  })

  it('reads a non-image as "not an image" even when its folder is unusable', () => {
    const deep = `${path(NINA_FOLDER_MAX_DEPTH + 2)}/Thumbs.db`
    const result = plan(NINA_FOLDER_ROOT, [walked(deep, { type: '' })])
    expect(result.rejected.map((r) => r.reason)).toEqual(['not_an_image'])
    expect(result.refused).toEqual([])
  })

  it('refuses an image whose destination breaks the grammar, with the grammar reason', () => {
    const tooDeep = plan(NINA_FOLDER_ROOT, [
      walked(`${path(NINA_FOLDER_MAX_DEPTH + 1)}/a.jpg`),
    ])
    expect(tooDeep.refused.map((r) => r.reason)).toEqual(['too_deep'])

    const traversal = plan(NINA_FOLDER_ROOT, [walked('a/../b/c.jpg')])
    expect(traversal.refused.map((r) => r.reason)).toEqual(['traversal'])

    const longSegment = plan(NINA_FOLDER_ROOT, [
      walked(`${'x'.repeat(NINA_FOLDER_MAX_SEGMENT_CHARS + 1)}/a.jpg`),
    ])
    expect(longSegment.refused.map((r) => r.reason)).toEqual(['segment_too_long'])
  })

  it('accepts a destination at exactly MAX_DEPTH', () => {
    const result = plan(NINA_FOLDER_ROOT, [walked(`${path(NINA_FOLDER_MAX_DEPTH)}/a.jpg`)])
    expect(result.upload).toHaveLength(1)
    expect(folderDepth(result.upload[0]?.folder ?? '')).toBe(NINA_FOLDER_MAX_DEPTH)
  })

  it('refuses a zero-byte file, which would upload a blob nothing can decode', () => {
    const result = plan(NINA_FOLDER_ROOT, [walked('a.jpg', { size: 0 })])
    expect(result.refused.map((r) => r.reason)).toEqual(['empty_file'])
  })

  it('refuses over the cap it was given, and accepts exactly the cap', () => {
    const over = plan(NINA_FOLDER_ROOT, [
      walked('big.jpg', { size: ADMIN_AVATAR_MAX_UPLOAD_BYTES + 1 }),
    ])
    expect(over.refused.map((r) => r.reason)).toEqual(['too_large'])

    const exact = plan(NINA_FOLDER_ROOT, [
      walked('big.jpg', { size: ADMIN_AVATAR_MAX_UPLOAD_BYTES }),
    ])
    expect(exact.upload).toHaveLength(1)
  })

  it('refuses an unnamed file and a name that is only dots', () => {
    const result = plan(NINA_FOLDER_ROOT, [
      { relativePath: '', name: '', type: 'image/jpeg', size: 10, lastModified: 1 },
      { relativePath: '', name: '..', type: 'image/jpeg', size: 10, lastModified: 1 },
    ])
    expect(result.refused.map((r) => r.reason)).toEqual(['unnamed', 'unnamed'])
  })

  it('refuses a name that is too long or carries a reserved character', () => {
    const long = plan(NINA_FOLDER_ROOT, [
      walked(`${'x'.repeat(NINA_FILENAME_MAX_CHARS + 1)}.jpg`),
    ])
    expect(long.refused.map((r) => r.reason)).toEqual(['name_too_long'])

    const bad = plan(NINA_FOLDER_ROOT, [{ ...walked('a.jpg'), name: 'a|b.jpg' }])
    expect(bad.refused.map((r) => r.reason)).toEqual(['bad_segment'])
  })

  it('recovers the name from the walked path when the entry has none', () => {
    const result = plan(NINA_FOLDER_ROOT, [
      { relativePath: 'Faces\\2026\\b.png', name: '', type: 'image/png', size: 10, lastModified: 1 },
    ])
    expect(result.upload[0]).toMatchObject({ folder: 'Faces/2026', filename: 'b.png' })
  })

  it('says so when a whole drop uploads nothing', () => {
    const result = plan(NINA_FOLDER_ROOT, [walked('Thumbs.db', { type: '' })])
    expect(result.counts).toEqual({ total: 1, upload: 0, existing: 0, rejected: 1, refused: 0 })
  })
})

/* ── The tree ─────────────────────────────────────────────────────────────────────────────── */

describe('folderCounts', () => {
  it('merges casings, keeps the first spelling, and folds null to the root', () => {
    const rows = [
      { folder: 'Faces' },
      { folder: 'faces' },
      { folder: null },
      { folder: 'FACES' },
      { folder: 'Faces\\2026\\' },
    ]
    expect(folderCounts(rows)).toEqual([
      { folder: 'Faces', count: 3 },
      { folder: NINA_FOLDER_ROOT, count: 1 },
      { folder: 'Faces/2026', count: 1 },
    ])
  })
})

describe('buildTree', () => {
  const entries: FolderCount[] = [
    { folder: 'Faces/2026', count: 3 },
    { folder: 'faces/2027', count: 2 },
    { folder: null, count: 1 },
  ]

  it('returns a single root that is a folder like any other', () => {
    const root = buildTree(entries)
    expect(root.path).toBe(NINA_FOLDER_ROOT)
    expect(root.name).toBe(NINA_FOLDER_ROOT_LABEL)
    expect(root.depth).toBe(0)
    expect(root.ownCount).toBe(1)
  })

  it('synthesizes the intermediate folder the query never returned', () => {
    const root = buildTree(entries)
    expect(root.children.map((c) => c.path)).toEqual(['Faces'])
    const faces = root.children[0]
    expect(faces?.ownCount).toBe(0)
    expect(faces?.depth).toBe(1)
    expect(faces?.children.map((c) => c.path)).toEqual(['Faces/2026', 'Faces/2027'])
  })

  it('counts descendants, so a collapsed folder does not read as empty', () => {
    const root = buildTree(entries)
    expect(root.totalCount).toBe(6)
    expect(root.children[0]?.totalCount).toBe(5)
    expect(root.children[0]?.children[0]?.totalCount).toBe(3)
  })

  it('keeps the first casing, for the folder and for every child path', () => {
    const root = buildTree(entries)
    const grown = root.children[0]?.children.map((c) => c.path)
    expect(grown).toEqual(['Faces/2026', 'Faces/2027'])
  })

  it('orders children deterministically and case-insensitively', () => {
    const root = buildTree([
      { folder: 'zeta', count: 1 },
      { folder: 'Alpha', count: 1 },
      { folder: 'beta', count: 1 },
    ])
    expect(root.children.map((c) => c.name)).toEqual(['Alpha', 'beta', 'zeta'])
  })

  it('adds up two entries that differ only in casing', () => {
    const root = buildTree([
      { folder: 'Faces', count: 2 },
      { folder: 'faces', count: 3 },
    ])
    expect(root.children).toHaveLength(1)
    expect(root.children[0]).toMatchObject({ path: 'Faces', ownCount: 5, totalCount: 5 })
  })

  it('builds an empty album as a bare root', () => {
    const root = buildTree([])
    expect(root.children).toEqual([])
    expect(root.totalCount).toBe(0)
  })
})

describe('findFolderNode', () => {
  const root = buildTree([
    { folder: 'Faces/2026', count: 3 },
    { folder: 'Faces/2027', count: 2 },
  ])

  it('finds the root, a branch and a leaf, ignoring casing and separator style', () => {
    expect(findFolderNode(root, '')?.path).toBe(NINA_FOLDER_ROOT)
    expect(findFolderNode(root, 'faces')?.path).toBe('Faces')
    expect(findFolderNode(root, 'FACES\\2027')?.path).toBe('Faces/2027')
  })

  it('returns null for a folder that is not in the tree', () => {
    expect(findFolderNode(root, 'Faces/2028')).toBeNull()
  })
})
```

**Impact:** One new suite. It imports `@/lib/admin/avatars`, which imports `@/lib/nina/images`,
both of which are pure and already covered by `tests/admin.avatars.test.ts`, so no setup, no
`DATABASE_URL`, no `server-only` alias is involved beyond what `tests/support/setup.ts` already
provides.

---

### Step 3: Confirm the four gates, and only those four

**File:** none — verification only.

**Change:** Run the repo's own gates. Nothing else in the tree changed, so a failure in any of them
is a failure in one of the two new files.

`npm run format:check` is the one most likely to complain, because both files are written by hand
against `.prettierrc`'s `printWidth: 100`, `semi: false`, `singleQuote: true`,
`trailingComma: 'all'`. `npm run format` fixes it; commit the result. Do **not** reflow the
docstrings to satisfy it — prettier does not reflow comments, so any complaint is about code.

`npm run lint` runs `eslint-config-next/typescript`; the module has no `any`, no unused binding, no
non-null assertion and no `React` anything. `tsconfig.json` has `noUncheckedIndexedAccess: true`,
which is why every indexed read in both files goes through `.at(-1) ?? …`, `.pop()` with a null
check, or `?.` — a bare `segments[segments.length - 1]` will not compile.

**Impact:** none.

---

## Verification

**Build:** `npm run typecheck` (`next typegen && tsc --noEmit`) — then `npm run build`, which must
be unchanged in output since nothing imports the new module.

**Tests:** `npm test`, and `npx vitest run tests/admin.filetree.test.ts` while iterating.

**Lint / format:** `npm run lint` and `npm run format:check`.

**CI guards:** `npm run ci:data-layer-guard`, `npm run ci:client-secret-guard`,
`npm run ci:f08-guard`, `npm run ci:llm-payload-guard`, `npm run ci:f11-guard`,
`npm run ci:openrouter-guard`. None of them should have anything to say — the f08 guard is the only
one that walks `lib/**`, and it looks for `recharts`, `yAxisId` and hand-rolled units, none of
which appear here.

**Manual check:** `grep -n "^import" lib/admin/filetree.ts` must print **nothing**. That is the
file's central invariant and the one a later edit is most likely to break; if it ever prints a line,
phase 5's client bundle is the thing that breaks, and it breaks at build time in a way that reads
like a Next.js problem rather than like this.

**Exit criteria:**

1. `lib/admin/filetree.ts` exists, exports every symbol in the Interface Contract, and has zero
   imports.
2. `tests/admin.filetree.test.ts` passes, including the `ADMIN_AVATAR_EXTS` /
   `ADMIN_AVATAR_CONTENT_TYPES` agreement assertions.
3. `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check` are all green.
4. `/admin/nina` renders exactly as it does today. There are no consumers yet; this phase adds
   unused capability and nothing else, which is what makes it independently shippable (see the
   plan's Rollback section).

---

## Handoffs

Work found while planning this phase and deliberately left where it belongs.

1. **The bounds overlap with phase 1 — RESOLVED by the reconciler, in this phase's favour.** Phase
   1's `lib/admin/avatars.ts` declares no folder bounds and no validator, and does not re-export
   them; phase 6's `lib/admin/folderPath.ts` is deleted; phase 4's `folderPathSchema` wraps
   `validateFolderPath` with an added `result.path === v` identity check so the server still
   refuses a non-canonical path rather than repairing it. `filetree.ts` is the repo's one folder
   grammar. Two definitions of `NINA_FOLDER_MAX_DEPTH` does not ship.

2. **The byte cap is a parameter, and phase 5 passes the real one — R1, phase 5. SETTLED.**
   `planFolderUpload({ …, maxBytes: ADMIN_AVATAR_MAX_UPLOAD_BYTES })`, imported from
   `lib/admin/avatars.ts:43`. Phase 5's draft assumed a 2-argument `planFolderUpload(local,
   manifest)` with the cap owned internally; the reconciler kept the required parameter, because
   this phase's argument is the repo's own rule (*"a constant that is agreed rather than shared is a
   constant that will one day disagree"*) and phase 5's `useFolderUpload.ts` already imports from
   `lib/admin/avatars.ts` for the pathname builders. One call site, one import, no second 8 MB.

3. **The `readEntries` batching loop — R1, phase 5.** `FileSystemDirectoryReader.readEntries()`
   returns results in batches and must be called until it returns an empty array; stopping at the
   first call is the silent-truncation bug in every naive implementation. It is a browser API, it
   cannot be tested under `environment: 'node'`, and it is explicitly phase 5's. What this phase
   guarantees is only that once the walk produces a flat list, the decisions over that list are
   correct.

4. **Chunking `plan.upload` to the batch bound — R1, phases 4 and 5. SETTLED.**
   `planFolderUpload` returns an unbounded array. The bound is `NINA_ADMIN_BATCH_MAX = 50`, and it
   lives in `lib/nina/album.ts` (phase 1) — **not** in `lib/admin/schema.ts`, which imports `zod`,
   and not in `lib/admin/avatars.ts` either. Phase 5 flagged the zod-bundling hazard and it is
   real; `lib/nina/album.ts` is the module that answers it, because it is already imported by
   client components today (`NINA_AVATAR_FALLBACK_SRC`) and has no `zod` and no `server-only`.
   Phase 5 slices `plan.upload` into that many records per `registerNinaAvatarsAction` call. This
   phase deliberately does not chunk, because the chunk size is the register action's property,
   not the diff's.

5. **`plan.folders` still never contains an empty folder, but that is no longer a dead end.**
   `planFolderUpload` reports the folders it saw FILES in, so a dropped tree containing an empty
   subdirectory does not report that subdirectory — this function only ever sees a flat file list
   and cannot know a directory existed with nothing in it.

   **The table it used to point at now exists.** This handoff read *"if the user ever wants an
   empty folder to persist, that is a `nina_folders` table and a different plan"*; the owner
   decided to build it, and phase 1 owns it. Two consequences for this module, both already
   handled above and repeated here because this is where a reader looks:

   - `buildTree` receives `{ folder, photos: 0 }` entries for declared empty folders, and a zero
     count must be rendered rather than filtered. Its docstring says so and the suite covers a
     zero-count entry as input.
   - `folderAncestors` gained a second consumer: phase 6's create action declares the whole
     ancestor chain, so creating `a/b/c` cannot leave `a/b` undeclared and therefore able to
     vanish when `c` is deleted. It returns the root as `''` and phase 1's `declareNinaFolders`
     filters it — nothing here changes.

   What is still true and worth keeping: an empty subdirectory inside a **dropped** tree is lost,
   because the browser hands over files and this module never learns the directory was there. Only
   *"New subfolder"* creates a durable empty folder. That is a smaller gap than the one this
   handoff originally described, and phase 5's drop-report copy is where it would be surfaced if
   it ever mattered.

6. **Lexicographic, not natural, child order.** `compareFolded` sorts `Folder 10` before
   `Folder 2`. Correct for a photo library organised by date (`2026-08` sorts properly), wrong for
   one organised by number. Fixing it means an `Intl.Collator` with `numeric: true`, which is
   locale-sensitive and would make the tree order untestable — so it is a knowing limitation, not
   an oversight. If phase 5 finds it intolerable in use, the collator belongs behind
   `compareFolded` and nowhere else.

7. **Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`…`LPT9`) are NOT refused.**
   The folder is a Postgres column and never a filesystem path, so a folder called `NUL` is
   harmless here. It stops being harmless the moment anything writes the tree to disk — a
   "download this folder as a zip" feature, most obviously. Whichever phase does that owns the
   check; this one records that it does not do it.

8. **The dedupe key is `(path, size, mtime)` and can be fooled.** Two different photographs with
   identical byte counts, saved into the same relative path within the same second, read as the same
   file. The analysis chose this over a content hash on cost grounds and that call stands; phase 1's
   unique index on `(user_id, source_key)` turns the collision into "the second file is not
   uploaded", not into a corrupted row. Worth one line in phase 4's docstring so the tradeoff is
   visible from the server side too.

9. **Nothing here serves R2.** `sourceKeyFor` is not an attachment pointer and `filetree.ts` knows
   nothing about `attachExisting`. R2's parse/format pair is `lib/nina/attach.ts` and phase 3's.

10. **`NinaAvatarBatchRecordLike` is NOT this module's, and was never written here.** Phase 5's
    draft assumed a structural batch-record type exported from `filetree.ts`. The reconciler put it
    nowhere: phase 5 imports `import type { AvatarBatchRecord } from '@/lib/admin/schema'` instead,
    which is phase 4's `z.infer` of the schema the server actually validates against — a type-only
    import erases entirely, so no `zod` reaches the `/admin` bundle, and the client literally
    cannot assemble a record the boundary would reject. A structural twin here would have been a
    third shape to keep in step with a Zod schema, which is the opposite of what the `AvatarLike`
    idiom is for: that idiom exists so a pure module need not import from `lib/db`, not so a client
    can avoid importing a validated shape.

---

## Rollback

`git rm lib/admin/filetree.ts tests/admin.filetree.test.ts`, or revert this phase's commit. Nothing
imports either file at the end of this phase, so the removal is total and the tree is byte-identical
to its pre-phase state — no migration, no blob, no row, no config. The plan's own Rollback section
already says as much: *"Phases 1, 2 and 3 are each shippable alone: 1 and 2 add unused capability."*

Rolling back **after** phase 4 or 5 has landed is a different operation: those phases import this
module, so revert them first, in reverse dependency order (7 or 6, then 5, then 4, then 2).
