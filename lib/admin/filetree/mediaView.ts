/**
 * The Media view: the tree pane's second, VIRTUAL collection — every original photograph of the
 * conversation, both kinds, rendered as a pinned sibling under the "Album" root.
 *
 * ── WHY A PARAM AND NOT A FOLDER PATH ────────────────────────────────────────────────────────
 * `Media` is not a folder and must never become one. A real folder would need a `nina_folders` row
 * or a `nina_avatars.folder` value, would appear in `FolderMenu`'s move universe, would be
 * renamable and deletable, and would hand `isFolderAncestorOf` a subtree that does not exist —
 * while a folder the operator legitimately names "Media" would collide with it. So the view
 * travels under its own PARAMETER KEY (`?view=media`) and never under `?folder=`:
 * `validateFolderPath('media')` stays `ok`, because a storable folder of that name keeps meaning a
 * folder. Distinguishing by KEY, not by a reserved path value, is what leaves the folder grammar
 * (`./pathGrammar.ts`) with no exception to maintain — and what keeps this directory's own
 * functions (`findFolderNode` in `./folderTree.ts`, `isFolderAncestorOf` in `./pathGrammar.ts`,
 * `buildTree` likewise) unable to even express the question "is Media in this tree".
 *
 * The read behind it is `listNinaMediaPhotos` (`lib/nina/queries.ts`); rows are mapped to
 * `MediaExplorerPhoto` on the server in `app/admin/nina/page.tsx`, exactly where the album's rows
 * are mapped. Verbs on a media row are a later phase's edit — this module is deliberately all
 * reading and naming.
 *
 * Imports nothing — not even a sibling — because nothing it names belongs to the folder grammar;
 * it is the one file in `lib/admin/filetree/` with no imports at all, per the directory's
 * import-purity rule (see `./bounds.ts`'s header).
 */

/** The parameter KEY the explorer's Media view is addressed by. */
export const NINA_MEDIA_VIEW_PARAM = 'view'

/** The parameter VALUE that selects it. Matched strictly — `Media` is a different string. */
export const NINA_MEDIA_VIEW_VALUE = 'media'

/**
 * Which of the explorer's collections a URL has open: `album` is the folder tree, `media` is the
 * virtual collection pinned under it.
 *
 * NOT the same question as which TABLE a row came from — that is
 * `MediaExplorerPhoto['origin']` (`components/admin/explorer/model.ts`). The two coincide today
 * (`?view=media` holds only media rows) and must stay separate words, because the pane's VERBS
 * care what writes are legal on a row (origin) while the tree and pager care what is open (view);
 * a phase that conflates them will offer an avatar action against a message image.
 */
export type ExplorerView = 'album' | 'media'

/**
 * `searchParams.view` -> the view, total and refusing nothing. A `searchParams` value is
 * `string | string[] | undefined` — a repeated parameter arrives as an array (the framework doc's
 * own table spells it) — so the FIRST value wins, the same `readOne` idiom `app/admin/nina/page.tsx`
 * applies to `?folder=` and `?page=`.
 *
 * Any other string — a typo, a stale bookmark, `?view=Media` — is "not a view we have" and reads
 * as the album, which is the only sensible fallback: the album view is what the bare URL has
 * always meant, and a view that degraded to an error page would turn one bad link into a broken
 * screen. Strictness here costs nothing because nothing downstream has to guess again.
 */
export function readExplorerView(raw: string | string[] | undefined): ExplorerView {
  const first = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
  return first === NINA_MEDIA_VIEW_VALUE ? 'media' : 'album'
}

/** What the pinned row is CALLED. A label constant beside the grammar it labels, for
 * `NINA_FOLDER_ROOT_LABEL`'s reason (see `./bounds.ts`): the name is read by two components and
 * one suite, and a string written twice is a string that will one day disagree. */
export const NINA_MEDIA_NODE_LABEL = 'Media'

/**
 * The tree pane's Media row, as the pure module states it — and deliberately NOT a `FolderNode`.
 *
 * A `FolderNode` (in `./folderTree.ts`) has a `path`, and everything a `path` enables —
 * `hrefForFolder`, `findFolderNode`, `FolderMenu`'s four verbs, the breadcrumb — is exactly what a
 * view must not have. So this node carries a `view` discriminant instead of a `path`, and no
 * `children` to recurse into: Media has no subfolders because it is not a place rows are filed,
 * it is a read. A component that wanted to treat it as a folder would have to write the cast
 * itself, which makes the misuse visible instead of structural.
 *
 * `count` is the whole collection (all pages), which is what a folder row's `totalCount` shows and
 * what a badge is for.
 */
interface MediaViewNode {
  view: 'media'
  name: string
  count: number
}

/**
 * Build the pinned node. Clamps the count exactly as `buildTree` clamps an entry's, so a hostile
 * or half-written number renders as `0` rather than as `NaN` in the tree pane — the same posture
 * this directory takes everywhere a number crosses from data to display.
 */
export function mediaViewNode(count: number): MediaViewNode {
  return {
    view: 'media',
    name: NINA_MEDIA_NODE_LABEL,
    count: Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0,
  }
}
