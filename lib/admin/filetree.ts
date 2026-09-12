/**
 * The file manager's decisions, made before anything touches the network. R1.
 *
 * `/admin/nina` becomes a file manager: nested folders, a directory picker, a folder dragged out of
 * Windows Explorer, and — the user's own word for it — the *optimisation* that it
 * "automatically upload only the new folders and files". Every one of those is a decision about a
 * list of files, and every one of them lives in this directory rather than in the component that
 * renders the result.
 *
 * Since 2026-09-12 the one 1,151-line module is SEVEN cohesive modules under `lib/admin/filetree/`,
 * and this file is their barrel — the single import path every reader keeps using:
 *
 * | file              | what it owns                                                            |
 * | ----------------- | ----------------------------------------------------------------------- |
 * | `bounds.ts`       | the limits and names; imports nothing                                    |
 * | `classify.ts`     | "only upload image files" — the MIME/extension verdict                   |
 * | `pathGrammar.ts`  | normalise, validate, fold, split, join, ancestors, breadcrumbs           |
 * | `sourceKey.ts`    | the stored dedupe key                                                    |
 * | `uploadPlan.ts`   | `planFolderUpload` — the four-bucket diff of a walked folder             |
 * | `folderTree.ts`   | `buildTree` and the nested folder model                                  |
 * | `mediaView.ts`    | the `?view=media` virtual collection; imports nothing                    |
 *
 * ── WHY THE FILE AND THE DIRECTORY SHARE A NAME ───────────────────────────────────────────────
 * Deliberate, and not an accident to clean up. TypeScript and every bundler this repo uses resolve
 * `@/lib/admin/filetree` to `filetree.ts` BEFORE trying `filetree/index.ts`, so the specifier is
 * unambiguous; and roughly a dozen comments across the repo say "the grammar is
 * `lib/admin/filetree.ts`" — keeping a real file at that exact path keeps every one of them true
 * without a repo-wide comment sweep riding a refactor that is about module boundaries, not about
 * where the grammar lives. (The alternative — deleting this file for a `filetree/index.ts` — would
 * leave those comments naming a path that no longer exists.) This file is a RE-EXPORT SHELL and
 * must never gain logic or an import outside `./filetree/`: both halves of
 * `tests/admin.filetreeBarrel.test.ts` enforce it, the surface half pinning the public names to
 * exactly what the single original exported, the purity half pinning the shell.
 *
 * ── WHY THIS IS A LIBRARY AND NOT PART OF THE EXPLORER ────────────────────────────────────────
 * Invariant 6, and it is measured rather than preferred. `vitest.config.ts` runs
 * `environment: 'node'` with no jsdom and this repo has no component tests by design, so logic
 * inside a `.tsx` is logic that cannot be asserted at all. Worse, F17 recorded what happens when an
 * upload decides in place: `onPick` chose from INSIDE a `setTiles` updater, `reactStrictMode: true`
 * double-invoked the updater in dev, and one picked file minted two upload tokens, wrote two blobs
 * and left one orphaned in the store for good — one file, one tile, two objects billed. See
 * `docs/plans/archive/F17-onpick-purity.md` and `planNinaPicked` in `lib/nina/images.ts`, whose header says
 * the same thing in fewer words: decide here, hand `setState` a value, run the effects afterwards.
 * A drop of three hundred files is that bug multiplied by three hundred.
 *
 * ── WHY THE DIRECTORY IS IMPORT-PURE ──────────────────────────────────────────────────────────
 * The single file had no imports at all, and the reason survives the split verbatim: its readers
 * are a `'use client'` explorer, a `'use server'` action module, a Route Handler and the unit
 * suite. `lib/nina/images.ts:5-7` records what one server-side import costs in that situation
 * ("one import of anything server-side and the client half of this phase stops compiling"), and
 * `lib/nina/album.ts:8-11` gets away with a single TYPE import only because a type erases. Restated
 * as the rule the split can actually check: **every file in `lib/admin/filetree/` imports only
 * `./` siblings, and this barrel only `./filetree/`** — no package specifier, no `../`, no
 * server-only or client-only module, in either direction. In particular do not import
 * `lib/admin/avatars.ts` for the byte cap — `planFolderUpload` takes `maxBytes` as an argument
 * precisely so the cap keeps its one definition.
 *
 * ── WHY THE ROW SHAPES ARE DECLARED IN THE MODULES INSTEAD OF IMPORTED FROM `lib/db` ──────────
 * The `AvatarLike` idiom (`lib/nina/album.ts:88-110`), for the reason `lib/nina/attach.ts:14-17`
 * gives: the pure module states what it NEEDS, and the query happens to return something
 * assignable to it, so a column rename is a compile error at one call site rather than an edit
 * here. (`LocalFileLike`, `ManifestEntryLike` and `FolderCount` in `uploadPlan.ts`/`folderTree.ts`
 * are that idiom.) It also means this directory was written at the same time as the migrations
 * that add the columns, with no coupling between the two.
 *
 * ── WHY FOLDERS ARE A PATH AND NOT A BLOB PREFIX ──────────────────────────────────────────────
 * Decided in the plan's Scope: blob layout stays flat (`nina/<userId>/avatar-<id>.<ext>`) and the
 * folder is a column. So renaming a folder is one UPDATE instead of an O(files) copy-and-delete of
 * bytes, and moving a photo copies nothing. The consequence this directory has to own is that a
 * folder exists *because rows are filed in it*: an empty folder in a dropped tree has nowhere to be
 * recorded and does not survive the upload. `planFolderUpload` returns `folders` for exactly the
 * folders its own rows will bring into existence, and nothing else.
 */

/* ── bounds ── */
export {
  NINA_FILENAME_MAX_CHARS,
  NINA_FOLDER_FORBIDDEN_RE,
  NINA_FOLDER_MAX_DEPTH,
  NINA_FOLDER_MAX_PATH_CHARS,
  NINA_FOLDER_MAX_SEGMENT_CHARS,
  NINA_FOLDER_ROOT,
  NINA_FOLDER_ROOT_LABEL,
  NINA_FOLDER_SEPARATOR,
  NINA_SOURCE_KEY_MAX_CHARS,
  NINA_SOURCE_KEY_VERSION,
} from './filetree/bounds'

/* ── classify ── */
export { classifyFile, fileExtension } from './filetree/classify'

/* ── pathGrammar ── */
export {
  folderAncestors,
  folderBreadcrumbs,
  folderDepth,
  folderName,
  folderParent,
  foldFolderPath,
  isFolderAncestorOf,
  isInFolderTree,
  joinFolderPath,
  normaliseFolderPath,
  sanitiseFolderSegment,
  splitFolderPath,
  validateFolderPath,
} from './filetree/pathGrammar'

/* ── sourceKey ── */
export { sourceKeyFor } from './filetree/sourceKey'

/* ── uploadPlan ── */
export {
  planFolderUpload,
  type LocalFileLike,
  type ManifestEntryLike,
  type PlannedUpload,
  type UploadRefusal,
} from './filetree/uploadPlan'

/* ── folderTree ── */
export {
  buildTree,
  findFolderNode,
  folderCounts,
  type FolderCount,
  type FolderNode,
} from './filetree/folderTree'

/* ── mediaView ── */
export {
  mediaViewNode,
  readExplorerView,
  NINA_MEDIA_NODE_LABEL,
  NINA_MEDIA_VIEW_PARAM,
  NINA_MEDIA_VIEW_VALUE,
  type ExplorerView,
} from './filetree/mediaView'
