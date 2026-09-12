/**
 * "Only upload image files" — the decision, made per file, from its name and its MIME type alone.
 *
 * The requirement is one sentence and the whole section is that sentence: MIME first when the
 * shell said anything decisive, the extension only as a fallback, and every refusal carrying a
 * reason a UI can quote. Nothing here touches bytes, network or React; the walked file arrives as
 * `{ name, type }` and leaves as a verdict.
 *
 * Imports `NINA_FOLDER_SEPARATOR` from `./bounds` so a whole Windows relative path can be passed
 * where a name is expected — that sibling import is the only one, per the directory's
 * import-purity rule (see `./bounds.ts`'s header).
 */
import { NINA_FOLDER_SEPARATOR } from './bounds'

/* ── The three containers the upload path can actually accept ─────────────────────────────── */

/**
 * Structurally identical to `ADMIN_AVATAR_EXTS` / `ADMIN_AVATAR_CONTENT_TYPES` in
 * `lib/admin/avatars.ts:31-36`, and NOT imported from there, because this directory is
 * import-pure (see `./bounds.ts`'s header).
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

/** Why a file is not going anywhere, when the reason is the file's own kind.
 *
 * Exported for the sibling modules (`./uploadPlan.ts` files a walked file under it in its
 * `rejected` bucket); NOT re-exported by the barrel — it is module plumbing, and the 2026-09-11
 * dead-exports audit kept it off the public surface on purpose. */
export type FileRejection = 'not_an_image' | 'unsupported_image'

/**
 * `decidedBy` is carried because it is the one thing worth logging when a folder uploads
 * differently on two machines: `'extension'` means the shell told us nothing and we guessed from
 * the name.
 */
type FileVerdict =
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
