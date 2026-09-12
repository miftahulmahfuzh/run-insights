/**
 * The dedupe key: the one string that answers "have I already uploaded this file?".
 *
 * Deliberately its own module in the split, small as it is, because it is the only piece of the
 * directory whose output is STORED — `nina_avatars.source_key`, under a unique index, compared as
 * text by the server. Everything else here produces decisions; this produces a value that has to
 * keep meaning the same thing across deploys, which is why its format version lives in
 * `./bounds.ts` beside the limits it is derived from.
 *
 * Imports only `./bounds` and `./pathGrammar`, per the directory's import-purity rule (see
 * `./bounds.ts`'s header).
 */

import { NINA_FOLDER_ROOT, NINA_FOLDER_SEPARATOR, NINA_SOURCE_KEY_VERSION } from './bounds'
import { foldFolderPath, normaliseFolderPath } from './pathGrammar'

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
