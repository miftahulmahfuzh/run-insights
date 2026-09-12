/**
 * The limits and names the file manager is expressed in, with none of the logic that uses them.
 *
 * This is the first file of the `lib/admin/filetree/` split and it imports nothing — not even a
 * sibling — because every other file in the directory sits on top of it and none may sit under a
 * server-only or client-only module. The zero-import invariant the single `filetree.ts` lived by
 * (`filetree.ts`'s own header records why: one server-side import and the client half of the
 * explorer stops compiling) is now stated per file and enforced by
 * `tests/admin.filetreeBarrel.test.ts`: **every file in this directory imports only `./`
 * siblings.** A constant that a route handler, a `'use server'` module and a `'use client'`
 * component all need is exactly the kind of thing that must stay importable from everywhere.
 */

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
