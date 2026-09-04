import type { LocalFileLike } from '@/lib/admin/filetree'

/**
 * The two browser APIs that turn a gesture into a list of files with paths. Nothing here is
 * testable and nothing here decides anything.
 *
 * (The one import is a TYPE from a zero-import module, so it erases and drags nothing in.)
 *
 * ── WHY THIS IS NOT IN `lib/` ───────────────────────────────────────────────────────────────
 * Invariant 6 puts *decidable* UI behaviour in `lib/` because vitest runs `environment: 'node'`
 * with no jsdom. The corollary is the reason this file sits under `components/`: it is nothing but
 * `DataTransferItem`, `FileSystemDirectoryReader` and `FileList`, none of which exist in Node, so
 * putting it in `lib/admin/` would break that directory's whole promise — that what is in it can be
 * proved. Every judgement this module could have made (is it an image, is the path legal, have we
 * got it already) is `lib/admin/filetree.ts`'s and is unit-tested there. This module returns
 * `{ path, file }` pairs and forms no opinion about them.
 *
 * ── THE TWO GESTURES PRODUCE THE SAME SHAPE ─────────────────────────────────────────────────
 * The picker gives `File.webkitRelativePath` for free. A drop gives nothing until the entry tree is
 * walked by hand. Both end as `WalkedFile[]`, which is what lets the diff, the queue and the
 * progress bar have exactly one implementation — and what makes this phase's exit criterion
 * ("a nested folder picked and the same folder dragged produce the same tree") a property of the
 * design rather than a thing to test twice.
 *
 * ── AND THAT SHAPE IS PHASE 2'S `LocalFileLike`, PLUS THE `File` ────────────────────────────
 * `WalkedFile extends LocalFileLike`, so a `WalkedFile[]` is what `planFolderUpload` takes with no
 * adapter — and because `PlannedUpload<T>.source` hands the caller's own object back, the `File`
 * comes out the far side of the diff still attached to its plan row. That is why `useFolderUpload`
 * keeps no `sourceKey -> File` map. The five plain fields are read off the `File` here rather than
 * in the hook, because this is the only module that is allowed to know what a `File` is.
 */

export interface WalkedFile extends LocalFileLike {
  /**
   * The path relative to the picked or dropped root, `/`-separated, filename included:
   * `bali/day-2/DSC_0031.jpg`. NOT normalised and NOT prefixed with the destination folder —
   * `planFolderUpload` normalises it and joins its own `base`, so those rules have one home and
   * one test suite.
   */
  relativePath: string
  file: File
}

/**
 * A ceiling on one gesture. *"Hundreds"* is the requirement; two thousand is generous headroom and
 * still a number a browser can hold decoded thumbnails for. Past it the walk stops and the queue
 * reports what it took — a truncated batch the operator can see is better than a tab that dies.
 */
export const EXPLORER_WALK_MAX_FILES = 2000

/**
 * How deep we will descend. Deeper than phase 1's folder-depth bound on purpose: a file below this
 * is REFUSED by `planFolderUpload` with a reason the operator reads, whereas a walk that stops
 * early just makes files vanish. Refusing loudly beats not looking.
 */
export const EXPLORER_WALK_MAX_DEPTH = 12

/**
 * **CALL THIS SYNCHRONOUSLY IN THE `drop` HANDLER, BEFORE THE FIRST `await`.**
 *
 * A `DataTransferItemList` is only valid during the dispatch of its own event. The moment the
 * handler yields to the microtask queue the list is emptied, and `webkitGetAsEntry()` then returns
 * `null` for every item — so an `async` drop handler that awaits anything at all before reading the
 * items sees an empty drop and silently uploads nothing. The `FileSystemEntry` objects THEMSELVES
 * stay valid indefinitely; it is only the item list that does not. Hence the split: this function is
 * synchronous and the walk is not.
 */
export function entriesFromDrop(dataTransfer: DataTransfer): FileSystemEntry[] {
  const out: FileSystemEntry[] = []
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== 'file') continue
    const entry = item.webkitGetAsEntry()
    if (entry != null) out.push(entry)
  }
  return out
}

/** Depth-first over entries captured by `entriesFromDrop`. Order is the OS's; nothing sorts it. */
export async function walkEntries(entries: readonly FileSystemEntry[]): Promise<WalkedFile[]> {
  const out: WalkedFile[] = []
  await descend(entries, '', 0, out)
  return out
}

async function descend(
  entries: readonly FileSystemEntry[],
  prefix: string,
  depth: number,
  out: WalkedFile[],
): Promise<void> {
  for (const entry of entries) {
    if (out.length >= EXPLORER_WALK_MAX_FILES) return
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`

    if (entry.isFile) {
      try {
        out.push(walkedFrom(path, await entryFile(entry as FileSystemFileEntry)))
      } catch (cause) {
        // A file the OS would not hand over: a lock, a permission, a dangling symlink, a
        // OneDrive placeholder that is not on this disk. Skipped, never thrown: one unreadable
        // file must not abort a three-hundred-file folder.
        console.warn('[f33] skipped an unreadable dropped file', path, cause)
      }
      continue
    }

    if (!entry.isDirectory || depth >= EXPLORER_WALK_MAX_DEPTH) continue
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    await descend(await readAllEntries(reader), path, depth + 1, out)
  }
}

/**
 * ── THE BUG THIS FUNCTION EXISTS FOR ────────────────────────────────────────────────────────
 * `FileSystemDirectoryReader.readEntries()` DOES NOT RETURN THE WHOLE DIRECTORY. Chromium returns
 * at most 100 entries per call and signals the end of the directory with an **empty array** — so
 * the naive version,
 *
 *     reader.readEntries((entries) => resolve(entries))
 *
 * silently truncates every folder to its first 100 files, with no error anywhere, and on the
 * *"hundreds of profile pics"* this feature exists for it would drop most of them. The pump below
 * calls the SAME reader repeatedly (a reader is a cursor; a fresh `createReader()` would start
 * over) and only resolves on the empty batch.
 *
 * It is a callback API, not a promise one, and it is not going to become one — it is non-standard
 * and frozen. The wrapper is the whole reason this is a named function rather than three lines
 * inline in `descend`.
 */
function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = []
    const pump = (): void => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all)
          return
        }
        all.push(...batch)
        pump()
      }, reject)
    }
    pump()
  })
}

/** `FileSystemFileEntry.file()` is callback-style too. One promise, one place. */
function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject)
  })
}

/**
 * The directory picker's half.
 *
 * `webkitRelativePath` is the entire contribution of `webkitdirectory`: `bali/day-2/DSC_0031.jpg`,
 * rooted at the folder the user chose in the dialog. It is `''` for an ordinary multi-file pick, in
 * which case the file lands in the current folder under its own name — which is exactly what "Add
 * photos" should do, so the two inputs share this function rather than branching.
 */
export function filesFromPicker(files: FileList | null): WalkedFile[] {
  return Array.from(files ?? []).map((file) =>
    walkedFrom(file.webkitRelativePath === '' ? file.name : file.webkitRelativePath, file),
  )
}

/**
 * The fallback for a drop that carried no entries — a browser without `webkitGetAsEntry`, or a drop
 * of loose files from an application rather than from a file manager. Flat, into the current folder.
 * Structure is lost because there was none to read; that is a degradation and not a failure, and it
 * is why `onDrop` tries `entriesFromDrop` first.
 */
export function filesFromDropList(dataTransfer: DataTransfer): WalkedFile[] {
  return Array.from(dataTransfer.files).map((file) => walkedFrom(file.name, file))
}

/**
 * The one place a `File` becomes five plain fields plus itself.
 *
 * Read eagerly rather than through getters on the `File`, because `planFolderUpload` is pure and
 * must be handed values: a lazily-read `size` would make the diff's input mutable between the plan
 * and the upload, which is the class of bug F17 measured on this exact path.
 */
function walkedFrom(relativePath: string, file: File): WalkedFile {
  return {
    relativePath,
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
    file,
  }
}
