/**
 * The diff: *"it would be perfect if i can drag and drop existing folders, and it automatically
 * upload only the new folders and files as optimization"* — decided before anything touches the
 * network.
 *
 * `planFolderUpload` partitions a walked folder into what goes up, what is already there, what is
 * not an image we can take, and what is refused with a reason — the buckets the explorer renders.
 * It is pure by construction and by history: F17 recorded what deciding inside a `setTiles` updater
 * costs (one picked file, two token mints, two blobs, one orphaned for good — see
 * `filetree.ts`'s header), so every input is five plain fields and no `File`, `ArrayBuffer` or
 * object URL is ever touched, which is what keeps the unit suite deterministic with no doubles.
 *
 * The heaviest importer in the directory: `./bounds` for the filename limits, `./classify` for the
 * per-file verdict, `./pathGrammar` for every destination decision and the two shared helpers
 * `sanitiseSegment`/`compareFolded`, `./sourceKey` for the dedupe key. All siblings, per the
 * directory's import-purity rule (see `./bounds.ts`'s header).
 */

import { NINA_FILENAME_MAX_CHARS, NINA_FOLDER_FORBIDDEN_RE } from './bounds'
import {
  classifyFile,
  type FileRejection,
  type NinaImageContentType,
  type NinaImageExt,
} from './classify'
import {
  compareFolded,
  folderAncestors,
  folderDepth,
  folderParent,
  foldFolderPath,
  isFolderAncestorOf,
  joinFolderPath,
  normaliseFolderPath,
  sanitiseSegment,
  splitFolderPath,
  validateFolderPath,
  type FolderPathRejection,
} from './pathGrammar'
import { sourceKeyFor } from './sourceKey'

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
type ExistingReason = 'already_uploaded' | 'duplicate_in_batch'

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
interface SkippedFile<T, R> {
  source: T
  name: string
  reason: R
}

interface FolderUploadPlan<T> {
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
 * directory is import-pure. Declaring an 8 MB here would be the second spelling of a number that
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
