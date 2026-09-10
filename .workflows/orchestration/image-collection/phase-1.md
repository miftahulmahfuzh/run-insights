# Phase 1: Media folder in the Image collection explorer (read path)

**Plan set:** `IMAGE_COLLECTION_PLAN.md`
**Analysis:** `20260910-154651-53D2_code_analyzer.md`
**Satisfies:** R1 — the read half: the Media folder exists in the album's folder list and shows what `/nina/about`'s Media section shows
**Depends on:** none (base `origin/main` @ `f429986`, branch `feature/image-collection`)
**Difficulty:** HARD
**Package:** `app/admin`, `components/admin/explorer`, `lib/admin`, `lib/nina`

---

## Goal

`/admin/nina` gains a second, virtual collection: the tree pane renders **Album** then **Media**
(with the total count), and `?view=media` swaps the content pane to a paginated (48/page) grid of
every original `nina_message_images` row — both kinds, his uploads included, orphans included,
newest first — mapped into the explorer's `ExplorerPhoto` shape. Media is a **view, never a folder
path**: no `nina_folders` row, no `nina_avatars.folder` value, invisible to
`isFolderAncestorOf`/move/delete, no folder verbs. `/admin/photos` stays live and untouched;
selection opens the pane **read-only** (download only), because every verb on a media row belongs
to Phase 2 and the describe panel to Phase 3.

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing. (`/admin/photos` and the `ChatPhoto*` family survive this phase intact.)

**Renames:** none. `ExplorerPhoto` keeps its name and its import sites; it becomes a discriminated
union (`AlbumExplorerPhoto | MediaExplorerPhoto`), which is a widening, not a rename — every
existing `photo.thumbUrl` / `photo.folder` / `photo.isCurrent` / `photo.crop` read still compiles,
because both union arms declare those fields.

**Creates:**
- `lib/admin/filetree.ts` (module stays zero-import):
  - `export const NINA_MEDIA_VIEW_PARAM = 'view'`
  - `export const NINA_MEDIA_VIEW_VALUE = 'media'`
  - `export type ExplorerView = 'album' | 'media'`
  - `export function readExplorerView(raw: string | string[] | undefined): ExplorerView`
  - `export const NINA_MEDIA_NODE_LABEL = 'Media'`
  - `export interface MediaViewNode { view: 'media'; name: string; count: number }`
  - `export function mediaViewNode(count: number): MediaViewNode`
- `lib/nina/queries.ts`:
  - `export interface NinaMediaPage { rows: NinaImageRow[]; total: number }` (types section, after `NinaChatPhotoPage`)
  - `export async function listNinaMediaPhotos(userId: string, opts?: { limit?: number; offset?: number }): Promise<NinaMediaPage>` — new §5a-2 block after `countNinaChatPhotos` (`:2010`)
  - `export async function countNinaMediaPhotos(userId: string): Promise<number>`
  - module-private `function mediaCollectionScope(userId)` — `user_id AND isOriginalPhoto()`, **no `kind` arm**
- `components/admin/explorer/model.ts`:
  - `export interface AlbumExplorerPhoto` (arm: `origin: 'album'`)
  - `export interface MediaExplorerPhoto` (arm: `origin: 'media'`; adds `kind: NinaImageKind`, `side: NinaPhotoSide`, `prompt: string | null`, `messageId: string | null`, `sortOrder: number`; pins `thumbUrl: null`, `isCurrent: false`, identity `crop`)
- `components/admin/FileExplorer.tsx`: props gain `view: ExplorerView`, `mediaCount: number`; module-private `function hrefForMediaView(page: number): string` joins `hrefForFolder` in the same file (the URL grammar's one home, now two arms)
- `components/admin/explorer/FolderTree.tsx`: props gain `view: ExplorerView`, `mediaCount: number`, `mediaHref: string`; internal `Row` loses `path/totalCount/allFolders/onNavigate/onFolderCreated` and gains `menu?: ReactNode`; internal `Branch` gains `albumOpen: boolean`
- `components/admin/explorer/PhotoGrid.tsx`: props gain `view: ExplorerView`

**Signature changes:** `ExplorerPhoto` interface -> union type (above). Nothing else.

**Requires (from earlier phases):** none — this phase lands on the base tree.

**Leaves alone (owned by others):**
- `listNinaChatPhotos` + `NinaChatPhotoPage` (the deleted page is their only caller), `app/admin/photos/page.tsx`, `ChatPhotoGrid/Detail/Controls/Add/Description/ProfilePicture`, `chatPhotoModel.ts`, `chatPhotoUpload.ts` — **Phase 2** (purge + guard lifts). `countNinaChatPhotos` and `generatedChatPhotoScope` are NOT purged: the image-reference picker (`listNinaPhotoReferences` `:4062-4066` and `resolveNinaPhotoReference` `:4140`, pinned by `tests/nina.imageprefs.test.ts:539-541`) is their remaining caller, so Phase 2 keeps both and rewords only the docstring bullets this phase writes about the hub card.
- `SelectionPane`'s album control set (framing pair, set-current, share, describe, remove), `updateNinaChatPhotoDescription`'s WHERE, `scheduleChatPhotoCaption`'s subject, the client upload flow — **Phase 2**
- the describe story (stored prose stays presence-only in this phase; `lib/nina/gateway.ts` untouched) — **Phase 3**
- all user-visible "Nina's album" copy (the `h1` stays; only the two body sentences branch on view), the borderless grid restyle, `PhotoReferencePicker.tsx` and its test, nav labels — **Phase 4**
- every runner-facing module (`galleryPhotos`, `chatViewerPhotos`, `photoSideOf` semantics, chat bubbles), the DB schema (no migration), Blob pathname shapes

## Files

| File | Action | What changes |
|---|---|---|
| `lib/admin/filetree.ts` | modify | append "The Media view" section: param constants, `ExplorerView`, `readExplorerView`, `NINA_MEDIA_NODE_LABEL`, `MediaViewNode`, `mediaViewNode` |
| `lib/nina/queries.ts` | modify | new `NinaMediaPage` interface (after `NinaChatPhotoPage:309`); new §5a-2 block after `countNinaChatPhotos:2010` with `mediaCollectionScope` + `listNinaMediaPhotos` + `countNinaMediaPhotos`; `isOriginalPhoto`'s docstring list gains the fourth filtered read |
| `components/admin/explorer/model.ts` | modify | `ExplorerPhoto` becomes `AlbumExplorerPhoto \| MediaExplorerPhoto`; `ExplorerPageInfo` docstring notes the media arm |
| `app/admin/nina/page.tsx` | modify | the `?view=media` arm: view validation, media read, `MediaExplorerPhoto` mapping, view-conditioned body copy, `view`/`mediaCount` threaded to `FileExplorer` |
| `components/admin/FileExplorer.tsx` | modify | props `view`/`mediaCount`; view-aware pager + toolbar + breadcrumbs; Add buttons and drops refused in media view; `PhotoMoveBar` album-only; `hrefForMediaView` joins the grammar |
| `components/admin/explorer/FolderTree.tsx` | modify | pinned Media row under the root's children; `Row` takes a `menu` node; active-row highlight keyed on `view` |
| `components/admin/explorer/PhotoGrid.tsx` | modify | `view` prop; media-flavoured empty state; tiles otherwise untouched (`thumbUrl ?? url` already renders originals) |
| `components/admin/explorer/SelectionPane.tsx` | modify | read-only media arm (early return after hooks): hero image, facts, Download; album pane byte-identical below it |
| `tests/admin.filetree.test.ts` | modify | suites for `mediaViewNode` and `readExplorerView`, plus the "no reserved folder path" pin |
| `tests/nina.photoRefs.test.ts` | modify | suites pinning the media read's SQL: reference filter present, `kind` filter ABSENT, page-size default/ceiling/offset |

## Implementation Steps

### Step 1: The Media view's pure half — constants, parser, tree node
**File:** `lib/admin/filetree.ts` (append after `findFolderNode`, end of file)
**Change:** new section. The module's zero-import rule holds — everything below is a constant, a
string test, or an object literal.
**Code:**
```ts
/* ── The Media view ───────────────────────────────────────────────────────────────────────── */

/**
 * The tree pane's second, VIRTUAL collection: every original photograph of the conversation, both
 * kinds, rendered as a pinned sibling under the "Album" root.
 *
 * ── WHY A PARAM AND NOT A FOLDER PATH ────────────────────────────────────────────────────────
 * `Media` is not a folder and must never become one. A real folder would need a `nina_folders` row
 * or a `nina_avatars.folder` value, would appear in `FolderMenu`'s move universe, would be
 * renamable and deletable, and would hand `isFolderAncestorOf` a subtree that does not exist —
 * while a folder the operator legitimately names "Media" would collide with it. So the view
 * travels under its own PARAMETER KEY (`?view=media`) and never under `?folder=`:
 * `validateFolderPath('media')` stays `ok`, because a storable folder of that name keeps meaning a
 * folder. Distinguishing by KEY, not by a reserved path value, is what leaves the folder grammar
 * with no exception to maintain — and what keeps this module's own functions (`findFolderNode`,
 * `isFolderAncestorOf`, `buildTree`) unable to even express the question "is Media in this tree".
 *
 * The read behind it is `listNinaMediaPhotos` (`lib/nina/queries.ts`); rows are mapped to
 * `MediaExplorerPhoto` on the server in `app/admin/nina/page.tsx`, exactly where the album's rows
 * are mapped. Verbs on a media row are a later phase's edit — this section is deliberately all
 * reading and naming.
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
 * `NINA_FOLDER_ROOT_LABEL`'s reason (above): the name is read by two components and one suite, and
 * a string written twice is a string that will one day disagree. */
export const NINA_MEDIA_NODE_LABEL = 'Media'

/**
 * The tree pane's Media row, as the pure module states it — and deliberately NOT a `FolderNode`.
 *
 * A `FolderNode` has a `path`, and everything a `path` enables — `hrefForFolder`, `findFolderNode`,
 * `FolderMenu`'s four verbs, the breadcrumb — is exactly what a view must not have. So this node
 * carries a `view` discriminant instead of a `path`, and no `children` to recurse into: Media has
 * no subfolders because it is not a place rows are filed, it is a read. A component that wanted to
 * treat it as a folder would have to write the cast itself, which makes the misuse visible instead
 * of structural.
 *
 * `count` is the whole collection (all pages), which is what a folder row's `totalCount` shows and
 * what a badge is for.
 */
export interface MediaViewNode {
  view: 'media'
  name: string
  count: number
}

/**
 * Build the pinned node. Clamps the count exactly as `buildTree` clamps an entry's, so a hostile
 * or half-written number renders as `0` rather than as `NaN` in the tree pane — the same posture
 * this module takes everywhere a number crosses from data to display.
 */
export function mediaViewNode(count: number): MediaViewNode {
  return {
    view: 'media',
    name: NINA_MEDIA_NODE_LABEL,
    count: Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0,
  }
}
```
**Impact:** additive only. Every existing `filetree` export, contract and test is untouched; the
module keeps zero imports, so the `'use client'` explorer, the Server Component page and the unit
suite can all read it.

### Step 2: The media read — all-kinds originals, paginated, with a count
**File:** `lib/nina/queries.ts`
**Change:** two insertions and one docstring extension.

**2a.** In the types section, directly after `NinaChatPhotoPage` (`lib/nina/queries.ts:306-309`),
insert:
```ts
/**
 * One page of the Media view — `/admin/nina?view=media` (R1, image-collection phase 1).
 *
 * Structurally the twin of `NinaChatPhotoPage` above and deliberately NOT a rename of it: that
 * interface's docstring is `/admin/photos`' contract, and the purge that deletes that surface
 * deletes its type with it. `rows` is `NinaImageRow` unchanged, for the same reason as there —
 * `imageColumns` is the projection, so the admin surface reads exactly what every other reader of
 * this table reads and no second row shape enters the module.
 */
export interface NinaMediaPage {
  rows: NinaImageRow[]
  /** Every ORIGINAL row for this user, BOTH kinds — not just this page. */
  total: number
}
```

**2b.** After `countNinaChatPhotos` (the block ends at `lib/nina/queries.ts:2010`, before the
`§5b` header at `:2012`), insert:
```ts
/* ============================================================================
 * §5a-2 The Media view — every ORIGINAL photograph, both kinds (R1)
 *
 * `/admin/nina?view=media` reads these. The membership is the exact set `/nina/about`'s Media
 * section shows (`listNinaMessageImages` + `isOriginalPhoto`) — NOT `/admin/photos`' generated-only
 * scope: the folder the user asked for is "semua foto - foto yang saat ini ada di Media", his
 * uploads included. Kept beside the generated pair rather than merged into it on purpose:
 * `generatedChatPhotoScope` outlives that surface's purge entirely — the image-reference picker
 * (`listNinaPhotoReferences`) still reads it — so the two scopes sit side by side for good, each
 * the one definition of its own surface.
 * ==========================================================================*/

/**
 * The predicate that DEFINES the Media view, written once so the page and the tree badge cannot
 * drift apart — `generatedChatPhotoScope`'s own argument, one view over.
 *
 * Deliberately NO `kind` arm, and that is the whole difference from the scope above: his composer
 * uploads (`kind = 'upload'`) are members here, because the point of the folder is that even a
 * manually-attached photograph becomes replaceable and adoptable. The reference filter STAYS —
 * a re-show is the same photograph, not a second one (`isOriginalPhoto`).
 *
 * Same index story as `generatedChatPhotoScope`, only cheaper: `isOriginalPhoto()` is residual (no
 * index carries it) and the `kind` residual is gone entirely, so the read is the index range scan
 * `nina_message_images_user_created_idx` was built for — equality on `user_id`,
 * `(created_at desc, id desc)` already in index order, nothing else filtered. **No index is being
 * added**: no migration in this plan, and nothing has measured a need.
 */
function mediaCollectionScope(userId: string) {
  return and(eq(ninaMessageImages.userId, userId), isOriginalPhoto())
}

/**
 * One page of the Media view, plus the total — the read behind `/admin/nina?view=media`.
 *
 * Modelled on `listNinaChatPhotos` above, with two deltas and one deliberate non-delta:
 *
 *   · the scope is `mediaCollectionScope` — no `kind` arm; see there.
 *   · the count is this section's own `countNinaMediaPhotos`, so the page and the tree badge share
 *     one predicate rather than two opinions about how many photographs exist.
 *
 * The non-delta is the page size: `NINA_CHAT_PHOTO_PAGE_SIZE` stays the default AND the ceiling
 * even though the rows are no longer only hers. That is not an oversight — the constant's NUMBER
 * was chosen for the cost of a page of originals (`nina_message_images` has no thumbnail column,
 * so every tile loads its full blob — `lib/nina/album.ts:80-105`), and this grid pays exactly the
 * same cost per tile. The number travels with the cost, not with the predicate.
 *
 * Two statements run concurrently and `offset` is floored at 0, for the reasons
 * `listNinaChatPhotos` and `NinaAvatarFolderPage` already record; not re-argued here.
 */
export async function listNinaMediaPhotos(
  userId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<NinaMediaPage> {
  const limit = Math.max(
    1,
    Math.min(opts.limit ?? NINA_CHAT_PHOTO_PAGE_SIZE, NINA_CHAT_PHOTO_PAGE_SIZE),
  )
  const offset = Math.max(0, Math.trunc(opts.offset ?? 0))

  const [rows, total] = await Promise.all([
    db
      .select(imageColumns)
      .from(ninaMessageImages)
      .where(mediaCollectionScope(userId))
      .orderBy(desc(ninaMessageImages.createdAt), desc(ninaMessageImages.id))
      .limit(limit)
      .offset(offset),
    countNinaMediaPhotos(userId),
  ])

  return { rows, total }
}

/**
 * How many original photographs the Media view holds, as a number rather than as a list of rows —
 * the tree pane's badge.
 *
 * The tree shows "Media <n>" on BOTH views, which is why the album arm runs this aggregate even
 * though it lists avatars: the badge is the rail's whole point (`FolderTree`'s header), and "how
 * many photographs are in there" is a question a count answers without a page of rows — the exact
 * mistake `countNinaAvatars` was written to undo. `listNinaMediaPhotos` does not call this one
 * twice — it calls it once, beside its own page — so listing and badge are one predicate by
 * construction.
 */
export async function countNinaMediaPhotos(userId: string): Promise<number> {
  const counted = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(ninaMessageImages)
    .where(mediaCollectionScope(userId))
  return counted[0]?.total ?? 0
}
```

**2c.** In `isOriginalPhoto`'s docstring (`lib/nina/queries.ts:1880-1897`), the filtered-reads
list grows a fourth entry and its heading loses a count that would immediately rot. Replace the
paragraph beginning `* Filtered — the COLLECTION reads` and the heading line above it with:
```ts
 * ── THE COLLECTION READS IT FILTERS, AND THE ONES IT MUST NEVER ───────────────────────
 * Filtered — the COLLECTION reads, which describe a set of photographs to a human:
 *   · `listNinaMessageImages`   → /nina/about's Media feed
 *   · `listNinaChatPhotos`      → /admin/photos, via `generatedChatPhotoScope`
 *   · `countNinaChatPhotos`     → /admin's hub card, via the same scope — which is why there are
 *                                 only TWO call sites for three reads, and why the listing and
 *                                 the count still cannot disagree about the total.
 *   · `listNinaMediaPhotos` + `countNinaMediaPhotos` → /admin/nina?view=media and its tree badge,
 *                                 via `mediaCollectionScope` — the all-kinds superset of the
 *                                 generated pair, sharing THIS predicate so a reference cannot
 *                                 sneak into one view while another hides it.
```
(The "NOT filtered" list below that paragraph is unchanged — it is the list a future "consistency"
cleanup would break, and `tests/nina.photoRefs.test.ts` asserts it as an absence.)
**Impact:** additive only; `/admin/photos` compiles and reads exactly as before. `NINA_CHAT_PHOTO_PAGE_SIZE`
is already imported at the top of the file (`lib/nina/queries.ts:54`).

### Step 3: `ExplorerPhoto` becomes a discriminated union
**File:** `components/admin/explorer/model.ts`
**Change:** the module stays types-only. `ExplorerPhoto` becomes
`AlbumExplorerPhoto | MediaExplorerPhoto`; the four fields that vary (`thumbUrl`, `folder`,
`isCurrent`, `crop`) stay on the shared base with their GENERAL types so every existing consumer
read compiles, while the media arm pins its specializations and adds the media-only fields.
`ExplorerPageInfo`'s docstring notes the media arm.

Replace the whole block from `export interface ExplorerPhoto {` (`:16`) through the closing brace
of `createdAt: string` (`:46`) with:
```ts
/**
 * Fields every explorer row has, whatever table it came from. The four that VARY between the two
 * arms (`thumbUrl`, `folder`, `isCurrent`, `crop`) are typed generally HERE and narrowed on the
 * media arm, so a consumer reading them off the `ExplorerPhoto` union gets the general type and
 * compiles either way — while a consumer reading a MEDIA-ONLY field must narrow on `origin` first,
 * which is the compiler refusing to let album code assume a message image.
 */
interface ExplorerPhotoBase {
  id: string
  /**
   * The ORIGINAL blob. Deliberately not what the grid renders.
   * `components/admin/UploadAvatar.tsx:26-33` is why it exists un-re-encoded ("a 4x zoom on a
   * 768 px source would show her face at 192 px of real detail"), and this is the URL the framing
   * studio, the sanity circles and the full-screen viewer all read.
   */
  url: string
  /**
   * The name a tile and the pane header print. Album rows: the file's name on his laptop, or the
   * id for a row written before the column existed. Media rows: DERIVED, because
   * `nina_message_images` has no filename column — the page builds one from the row's date and id
   * (see `app/admin/nina/page.tsx`'s media arm).
   */
  filename: string
  width: number | null
  height: number | null
  bytes: number | null
  /** Album: the `nina_avatars.source` column. Media: the row's own `kind`, which on that table
   * IS the provenance — `'generated'` came from her worker, `'upload'` came from his composer. */
  source: string
  /** Album: the row's `is_current`. Media: always `false` — see `MediaExplorerPhoto`. */
  isCurrent: boolean
  /** Read by nothing in `components/` — invariant 5. Shown as present/absent, never rendered. */
  description: string | null
  crop: NinaCropInput
  /** ISO 8601. A `Date` does not survive the RSC boundary. */
  createdAt: string
  /** `''` is the album root, `'2026/bali'` is two levels down, and `''` is also the only value a
   * media row ever carries — it is filed nowhere. Never a blob prefix — a column. */
  folder: string
  /**
   * The 256 px derived JPEG, or `null`.
   *
   * **`null` is not an edge case, it is the migration path.** Every row that existed before the
   * column was added has no thumbnail, and a browser without `OffscreenCanvas` uploads none. Every
   * consumer therefore falls back to `url`, and the grid is correct-but-heavy rather than broken.
   * Media rows are `null` PERMANENTLY — see `MediaExplorerPhoto`.
   */
  thumbUrl: string | null
}

/** One row of the album: an `nina_avatars` row, narrowed to what a browser needs. */
export interface AlbumExplorerPhoto extends ExplorerPhotoBase {
  origin: 'album'
}

/**
 * One row of the Media view: an original `nina_message_images` row, the superset
 * `listNinaMediaPhotos` reads. Everything the Chat-photos surface knew about such a row
 * (`components/admin/chatPhotoModel.ts`) collapses into this arm as that surface merges away —
 * including its two load-bearing docstrings: `pathname` is never parsed, and an orphan
 * (`messageId: null`) is a first-class member, not an error.
 */
export interface MediaExplorerPhoto extends ExplorerPhotoBase {
  origin: 'media'
  /**
   * Always `null`, and typed as the LITERAL so a media row cannot grow a thumbnail by accident:
   * the table has no thumbnail column (`lib/nina/album.ts:80-105`'s argument), so the grid's
   * `photo.thumbUrl ?? photo.url` fallback is the only render path — the accepted cost behind
   * `NINA_CHAT_PHOTO_PAGE_SIZE = 48`.
   */
  thumbUrl: null
  /**
   * Always `false`. Adoption (`setChatPhotoAsAvatarAction`) COPIES the bytes into `nina_avatars`,
   * and it is the copy that carries `is_current` — a message image is never itself her face.
   */
  isCurrent: false
  /** Identity (all three null): `resolveCrop` folds it to centred `object-cover`. Framing begins
   * only when an adoption mints an avatar row that can store one. */
  crop: NinaCropInput
  /** The table's own kind: `'generated'` (her worker) or `'upload'` (his composer). */
  kind: NinaImageKind
  /** `photoSideOf(kind)`, computed on the server exactly as `galleryPhotos` computes it. */
  side: NinaPhotoSide
  /**
   * The generation sidecar, carried in full — `/admin` is the one surface where reading it is the
   * point. Non-null only while the generated bytes are still the ones the prompt produced:
   * `updateNinaChatPhotoBlob` nulls it on replace, which is why a replaced row offers no prompt
   * affordance in the phase that renders one.
   */
  prompt: string | null
  /**
   * The bubble this photograph hangs off, or NULL once it has outlived one — a session delete
   * orphans the row instead of destroying it. An ORPHAN is a first-class member of the Media
   * collection; the pane says so in words rather than printing an empty cell.
   */
  messageId: string | null
  /** Position within its message's bubble. `0` for everything the worker wrote. */
  sortOrder: number
}

/**
 * One row of the explorer's content pane — an album avatar OR a Media photograph. Narrow on
 * `photo.origin` (`'album' | 'media'`) to reach an arm's own fields.
 */
export type ExplorerPhoto = AlbumExplorerPhoto | MediaExplorerPhoto
```
Also add the two type imports beside the existing ones at the top of the file (`:1-2`):
```ts
import type { UploadRefusal } from '@/lib/admin/filetree'
import type { NinaCropInput } from '@/lib/nina/crop'
import type { NinaPhotoSide } from '@/lib/nina/album'
import type { NinaImageKind } from '@/lib/db/schema'
```
And extend `ExplorerPageInfo`'s docstring (`:60-67`) — insert after the existing `folder` field's
comment line (`* Rows in THIS folder, not in its subtree. The grid is not recursive; the tree is.`)
one sentence:
```ts
  /**
   * The folder this page was read from. `''` on the Media arm too — a message image is filed
   * nowhere — but there it is UNREAD: the pager is view-scoped and the breadcrumb draws from
   * `view`, so the value exists only to keep this one shape serving both arms.
   */
  folder: string
```
**Impact:** `ExplorerPhoto` consumers are `PhotoGrid`, `SelectionPane`, `FileExplorer` and the page
(all touched below); nothing else imports it (verified by grep). `photo.origin === 'media'`
narrows the union — no type-guard function is needed, so the module keeps its "types only, nothing
here is a runtime export" property. Type-only imports erase, so the client graph still drags in no
server code.

### Step 4: The `?view=media` arm of the page
**File:** `app/admin/nina/page.tsx`
**Change:** the whole component body is restructured into two arms that fill the same four slots
(`folders`, `photos`, `pageInfo`, `mediaTotal`) and fall through to ONE render. `searchParams` is
awaited per this repo's own Next docs (16.3.1,
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`: `searchParams`
is a `Promise`, must be awaited, repeated params arrive as arrays; `PageProps<'/admin/nina'>` types
it) — the file's existing header already records this and it stays true. `npm run typecheck` (which
runs `next typegen` first) is the gate that proves it.

Replace the imports (`:1-7`) with:
```tsx
import { FileExplorer } from '@/components/admin/FileExplorer'
import type {
  AlbumExplorerPhoto,
  ExplorerFolder,
  ExplorerPageInfo,
  ExplorerPhoto,
  MediaExplorerPhoto,
} from '@/components/admin/explorer/model'
import { NINA_FOLDER_ROOT, readExplorerView, validateFolderPath } from '@/lib/admin/filetree'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import {
  NINA_ADMIN_PAGE_SIZE,
  NINA_AVATAR_FALLBACK_SRC,
  NINA_CHAT_PHOTO_PAGE_SIZE,
  photoSideOf,
} from '@/lib/nina/album'
import {
  countNinaMediaPhotos,
  listNinaAvatarFolders,
  listNinaAvatarsInFolder,
  listNinaMediaPhotos,
  type NinaAvatarFolderCount,
} from '@/lib/nina/queries'
import { shareOrigin } from '@/lib/share/origin'
```

Replace `export default async function AdminNinaPage(props: PageProps<'/admin/nina'>) { ... }`
(`:67-166`) with:
```tsx
export default async function AdminNinaPage(props: PageProps<'/admin/nina'>) {
  const { userId } = await requireAdmin()

  const params = await props.searchParams
  /*
   * The view is read FIRST, because it decides which table this page reads at all. `?view=media`
   * ignores `?folder=` by construction: Media is not a folder and has no path, so a folder on a
   * media URL is a stale parameter, not a destination — the media arm never consults `folder`, and
   * the breadcrumb draws "Album / Media" from `view` alone. The folder is still VALIDATED
   * unconditionally, because the album arm below needs it and because a refused path must fall
   * back to the root on both arms rather than throw.
   */
  const view = readExplorerView(params.view)
  const requested = validateFolderPath(readOne(params.folder) ?? NINA_FOLDER_ROOT)
  const folder = requested.ok ? requested.path : NINA_FOLDER_ROOT
  const page = readPage(readOne(params.page))

  /*
   * The two arms fill the same four slots and fall through to ONE render, because the header, the
   * tree and the explorer are the same chrome over either table. `folders` (the tree's read) is
   * unconditional: BOTH views draw the same tree pane, Media pinned under "Album", so the tree
   * must be built even while the grid is showing the other collection.
   */
  let folders: NinaAvatarFolderCount[]
  let photos: ExplorerPhoto[]
  let pageInfo: ExplorerPageInfo
  let mediaTotal: number

  if (view === 'media') {
    /*
     * One page of every ORIGINAL conversation photograph, both kinds, orphans included. No
     * `limit` argument on purpose: `NINA_CHAT_PHOTO_PAGE_SIZE` is the read's own default AND
     * ceiling, so the constant's one spelling governs the page size and no call site can quietly
     * widen it into the unpaginated read it exists to prevent.
     */
    const [listed, treeFolders] = await Promise.all([
      listNinaMediaPhotos(userId, { offset: (page - 1) * NINA_CHAT_PHOTO_PAGE_SIZE }),
      listNinaAvatarFolders(userId),
    ])
    folders = treeFolders

    /*
     * Row -> prop on the server, for the same reason as the album arm below: plain serializable
     * props and nothing else. `side` is `photoSideOf(kind)` computed HERE, which is what keeps the
     * his/hers discriminator in one place (`lib/nina/album.ts`) — the same call `galleryPhotos`
     * makes for the same reason.
     *
     * `filename` is DERIVED, because the table has no filename column: the day the photograph was
     * made plus its id, so two same-day photographs still sort apart in a `title=` and in the pane
     * header. Not parsed out of `pathname` — the pathname is displayed, never read
     * (`chatPhotoModel.ts`'s rule, which this arm inherits with the rows).
     */
    photos = listed.rows.map((row): MediaExplorerPhoto => ({
      origin: 'media',
      id: row.id,
      url: row.blobUrl,
      /* `null`, permanently: the table has no thumbnail column (`lib/nina/album.ts:80-105`), so
         the grid's `thumbUrl ?? url` fallback is the only render path. */
      thumbUrl: null,
      /* A message image is filed nowhere. The value is the album root's path — but nothing links
         into it: the breadcrumb and the pane draw their trail from `view`, and folder verbs never
         see a media row. */
      folder: NINA_FOLDER_ROOT,
      filename: `${row.createdAt.toISOString().slice(0, 10)} ${row.id}`,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
      /* On this table the kind IS the provenance: 'generated' from her worker, 'upload' from his
         composer. Rendered as the pane's Source row, never assumed. */
      source: row.kind,
      /* Never her current face: adoption COPIES the bytes into `nina_avatars`, and it is the copy
         that carries `is_current`. */
      isCurrent: false,
      description: row.description,
      /* Identity crop — `resolveCrop` folds the three nulls to centred object-cover. Framing
         arrives only when adoption mints an avatar row that can store one. */
      crop: { scale: null, x: null, y: null },
      createdAt: row.createdAt.toISOString(),
      kind: row.kind,
      side: photoSideOf(row.kind),
      prompt: row.prompt,
      messageId: row.messageId,
      sortOrder: row.sortOrder,
    }))

    pageInfo = {
      folder: NINA_FOLDER_ROOT,
      page,
      pageSize: NINA_CHAT_PHOTO_PAGE_SIZE,
      total: listed.total,
    }
    mediaTotal = listed.total
  } else {
    /*
     * The media badge's count rides along on the album arm too: the tree pane shows "Media <n>" on
     * every view, and one aggregate answers it — the same single `count(*)` the /admin hub card
     * runs, and the exact shape `countNinaAvatars` was written to make cheap.
     */
    const [listed, treeFolders, mediaCount] = await Promise.all([
      listNinaAvatarsInFolder(userId, folder, {
        limit: NINA_ADMIN_PAGE_SIZE,
        offset: (page - 1) * NINA_ADMIN_PAGE_SIZE,
      }),
      listNinaAvatarFolders(userId),
      countNinaMediaPhotos(userId),
    ])
    folders = treeFolders

    /* The row -> prop mapping is here rather than in the client component for the reason it always
     * was: `NinaAvatarRow` carries `announcedAt`, `pathname`, `sourceKey` and `thumbPathname`, none
     * of which a browser has any use for, and none of which should cross the serialization boundary
     * wholesale.
     *
     * `filename` falls back to the id because every row written before the column existed has
     * none, and a grid tile with no label under it is worse than a tile labelled by its id.
     * The `(row): AlbumExplorerPhoto` annotation is what keeps `origin: 'album'` a literal —
     * without it the string widens and the union stops being discriminable. */
    photos = listed.rows.map((row): AlbumExplorerPhoto => ({
      origin: 'album',
      id: row.id,
      url: row.blobUrl,
      thumbUrl: row.thumbUrl,
      folder: row.folder,
      filename: row.filename ?? row.id,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
      source: row.source,
      isCurrent: row.isCurrent,
      description: row.description,
      crop: { scale: row.cropScale, x: row.cropX, y: row.cropY },
      createdAt: row.createdAt.toISOString(),
    }))

    pageInfo = {
      folder,
      page,
      pageSize: NINA_ADMIN_PAGE_SIZE,
      total: listed.total,
    }
    mediaTotal = mediaCount
  }

  /* `NinaAvatarFolderCount`'s count field is `photos` (phase 1's name; this phase's draft assumed
   * `count`). `ExplorerFolder` keeps `count`, because that is what makes it structurally
   * assignable to phase 2's `FolderCount` and `buildTree` therefore needs no adapter. */
  const folderList: ExplorerFolder[] = folders.map((entry) => ({
    folder: entry.folder,
    count: entry.photos,
  }))

  const albumTotal = folderList.reduce((sum, entry) => sum + entry.count, 0)

  return (
    <div>
      <header className="mb-5 lg:mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Nina&rsquo;s album</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          {/*
           * The body copy follows the view; the h1 does not (its rename is a later phase's edit,
           * kept out of here so this phase ships no label churn). The media sentence says what the
           * view IS and nothing about verbs that have not landed yet.
           */}
          {view === 'media'
            ? 'Every photograph of the conversation &mdash; hers and his, uploads included &mdash; newest first, the same set the Media section shows.'
            : 'Drop a folder straight out of Explorer and only the new files upload. Click a photo to frame her face and make it her profile picture. Folders are metadata, not blob paths, so moving a photo moves no bytes.'}
        </p>
      </header>

      {/* The empty-ALBUM notice is an album-view fact (it is about her committed face and about
          dropping folders). On the media arm the grid's own empty state speaks instead, so the
          operator is never told to drop a folder over a grid of conversation photographs. */}
      {view === 'album' && albumTotal === 0 ? (
        <p className="mb-6 max-w-[70ch] rounded-card border border-rule bg-card p-5 text-[13px] font-medium text-ink-2">
          The album is empty, so she is still showing the committed photo (
          <code className="text-ink">{NINA_AVATAR_FALLBACK_SRC}</code>). Add a folder below and the
          first photo you make hers becomes her face.
        </p>
      ) : null}

      {/*
       * `shareOrigin()` is resolved HERE, on the server, and handed down as a string — phase 7 /
       * R2. `lib/share/origin.ts` opens with `import 'server-only'`, so no client component can
       * call it, and invariant 9 (roadmap §4.1) forbids exporting it as a build-time public
       * environment variable. That is not a limitation being worked around; it is the mechanism.
       * In production this is `AUTH_URL` — `https://runins.site`, the origin the user named in the
       * requirement — and on a preview deployment it is the project's stable production hostname
       * rather than the per-deployment one, so a link minted on a preview still opens the real
       * chat instead of a hostname that dies at the next push.
       *
       * `view` and `mediaCount` are the media arm's thread: which collection the URL has open, and
       * how many photographs it holds in total — the tree badge needs the count on BOTH views,
       * which is why the album arm ran the aggregate.
       *
       * The leading `*` on every line is the same load-bearing detail `SelectionPane`'s seam
       * comment records: `ci:client-secret-guard`'s Rule 3 exempts only lines a comment scanner
       * recognises, and a JSX comment with bare prose continuation lines fails the guard while
       * explaining why it is being obeyed.
       */}
      <FileExplorer
        userId={userId}
        folders={folderList}
        photos={photos}
        page={pageInfo}
        view={view}
        mediaCount={mediaTotal}
        shareOrigin={shareOrigin()}
      />
    </div>
  )
}
```
The module-private `readOne` and `readPage` helpers at the bottom of the file (`:168-182`) are
unchanged — `readExplorerView` subsumes the param-shape half of `readOne` for `view` only, and the
page's other two parameters keep their existing parser.
**Impact:** the album arm is behaviour-identical (same reads, same mapping fields, one added field
`origin: 'album'`, one added aggregate). The media arm is new. Two `Promise.all`s total on either
arm — the view-specific read is a second round trip rather than a third arm of one `Promise.all`,
because a conditional member would hand this file a rows-union it would then have to unpick with a
cast; clarity over one overlapping round trip on a page that is already `force-dynamic`.

### Step 5: `FileExplorer` — the view state, the grammar's second arm, and the refusals
**File:** `components/admin/FileExplorer.tsx`
**Change:** the component gains `view` and `mediaCount`; the pager, toolbar, breadcrumb, drop
target, `PhotoMoveBar` and the tree wiring become view-aware; `hrefForMediaView` joins
`hrefForFolder` at the bottom of the file so the URL grammar keeps exactly one home.

**5a.** Replace the import of filetree (`:9`) with:
```ts
import {
  folderBreadcrumbs,
  NINA_MEDIA_NODE_LABEL,
  NINA_MEDIA_VIEW_PARAM,
  NINA_MEDIA_VIEW_VALUE,
  type ExplorerView,
} from '@/lib/admin/filetree'
```

**5b.** Replace the whole `export function FileExplorer(...) { ... }` (`:71-412`) with:
```tsx
export function FileExplorer({
  userId,
  folders,
  photos,
  page,
  view,
  mediaCount,
  shareOrigin,
}: {
  userId: string
  folders: readonly ExplorerFolder[]
  photos: readonly ExplorerPhoto[]
  page: ExplorerPageInfo
  /**
   * Which collection the URL has open — the tree's active row, the pager's target and the
   * toolbar's copy all follow it. `app/admin/nina/page.tsx` reads `?view=` and hands it down; this
   * component never parses the parameter itself, for the same reason it never parses `?folder=`.
   */
  view: ExplorerView
  /**
   * How many original conversation photographs exist in total. The tree pane's Media badge shows
   * it on BOTH views, so the album view pays one aggregate for a number its grid never uses — the
   * badge is the rail's whole point, and a badge without a count is decoration.
   */
  mediaCount: number
  /**
   * Phase 7 / R2. Where a "Share link to Nina" link points — `shareOrigin()`'s output, resolved in
   * `app/admin/nina/page.tsx` because `lib/share/origin.ts` is `server-only` and invariant 9
   * forbids a build-time public environment variable for it. Threaded through, UNREAD, to
   * `SelectionPane`; nothing in the explorer itself may substitute `window.location.origin` for it.
   */
  shareOrigin: string
}) {
  const router = useRouter()
  const folder = page.folder

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  /**
   * The folder rail's visibility BELOW `lg`, where the explorer is one column and the rail would
   * otherwise be a hundred rows of chrome sitting on top of the photographs.
   *
   * Closed by default, and that is not a compromise: the breadcrumb directly above already answers
   * "where am I", and the question a file manager gets asked on a 414 px screen is "show me this
   * folder's photos", not "show me the whole tree". Opening it is one tap, and it stays open until
   * it is shut — so a session spent reorganising folders is not a session spent re-opening a
   * drawer.
   *
   * `lg:` classes and NOT a `matchMedia` hook. At and above `lg` the rail is always rendered and
   * this flag is inert, so there is no breakpoint to observe, nothing to hydrate against, and no
   * first frame where the desktop layout is missing a column. The rail also stays in the DOM at
   * every width, which is what keeps `FolderTree`'s expansion overrides and an open `FolderMenu`
   * panel alive across a toggle instead of remounting them.
   */
  const [treeOpen, setTreeOpen] = useState(false)

  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const element = folderInputRef.current
    if (element == null) return
    // See the header. This one line is the directory picker.
    element.webkitdirectory = true
  }, [])

  const onFinished = useCallback(() => {
    // Every register chunk already called `revalidatePath('/admin/nina')`, so the grid has been
    // filling in as the queue drained. This is the belt to those braces for the final partial
    // chunk, and it costs one RSC render per gesture.
    router.refresh()
  }, [router])

  /*
   * The upload hook stays MOUNTED on both views (it is a hook; it cannot be conditional) but the
   * media view never starts it: the Add buttons below are album-only and the drop handler refuses,
   * so `upload` is idle chrome in media view until the media Add flow lands (phase 2).
   */
  const upload = useFolderUpload({ userId, destination: folder, onFinished })

  const selected = photos.find((photo) => photo.id === selectedId) ?? null

  const hrefFor = useCallback((next: string) => hrefForFolder(next, 1), [])
  /* The pager follows the view: a media page 2 must link to `?view=media&page=2`, not silently
     drop the operator back into the album. */
  const hrefForPage = useCallback(
    (next: number) => (view === 'media' ? hrefForMediaView(next) : hrefForFolder(folder, next)),
    [view, folder],
  )
  /* The tree's Media row always targets page 1 — the same rule the folder rows follow. Built by
     the same grammar family below, so the URL keeps exactly one home even with two arms. */
  const mediaHref = hrefForMediaView(1)

  /**
   * PHASE 6. Folders the operator created in this session, held until a server read names them.
   *
   * They are **durable** — `createNinaAlbumFolderAction` declares them in `nina_folders` and
   * `listNinaAvatarFolders` UNIONs the declarations with the folders the photograph rows imply, so
   * a reload shows an empty folder. This state is not the folder's storage; it is the window
   * between the action resolving and this component receiving a `folders` prop that includes it,
   * during which the tree would otherwise navigate into a folder it cannot draw.
   *
   * The merge below is a filter and not a union: once `folders` from the server names a folder, the
   * pending copy is redundant and must not survive a rename of it.
   */
  const [pendingFolders, setPendingFolders] = useState<readonly string[]>([])

  const addPendingFolder = useCallback((next: string) => {
    setPendingFolders((previous) => (previous.includes(next) ? previous : [...previous, next]))
  }, [])

  /* A flat `string[]`, because `FolderMenu` and `PhotoMoveBar` want destinations without counts.
   * `folders` is `ExplorerFolder[]` (`{ folder, count }`), so this is derived from it rather than
   * spread — and `folders` itself is untouched and still feeds `FolderTree`'s `buildTree`. */
  const allFolders = useMemo(() => {
    const known = new Set(folders.map((entry) => entry.folder))
    return [
      ...folders.map((entry) => entry.folder),
      ...pendingFolders.filter((entry) => !known.has(entry)),
    ].sort()
  }, [folders, pendingFolders])

  /* `hrefFor` builds a URL; a folder operation decides where to go only once the server has
   * answered, so it needs a navigator rather than a link. A folder operation fired while Media is
   * open lands on the folder's ALBUM view — the only place its rows can be drawn. */
  const navigateToFolder = useCallback(
    (next: string) => router.push(hrefFor(next)),
    [router, hrefFor],
  )

  /* Selecting IS opening the pane — there is no separate details toggle: the pane mounts for the
   * selection, and its × hands the selection back (see the render at the bottom of the file). On
   * the media arm the pane is read-only (SelectionPane decides, off `photo.origin`). */
  function select(id: string) {
    setSelectedId(id)
  }

  function onPickFolder(event: React.ChangeEvent<HTMLInputElement>) {
    const walked = filesFromPicker(event.target.files)
    event.target.value = '' // so re-picking the same folder fires change again
    if (walked.length === 0) return
    upload.start(walked)
  }

  function onDragEnter(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    /* Media is a read view in this phase: the drag is absorbed (preventDefault here and in
       onDragOver is what stops the browser navigating away to open the dropped file) but no overlay
       is drawn and no upload starts. Phase 2 migrates the Add flow into this view. */
    if (view === 'media') return
    dragDepth.current += 1
    setDragging(true)
  }

  function onDragOver(event: React.DragEvent<HTMLDivElement>) {
    // Without this the browser never fires `drop` at all — it is not optional and it is the single
    // most common reason a hand-rolled drop zone silently does nothing.
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)

    /* Phase 2 owns the media Add flow (carrier-message upload with a dedupe pre-check). Until it
       lands, a drop into Media must not start the FOLDER upload — which would write album rows
       this grid will never show, i.e. bytes the operator cannot see leaving. */
    if (view === 'media') return

    /*
     * SYNCHRONOUS, BEFORE ANYTHING AWAITS. `dropWalk.ts`'s header has the full argument: a
     * `DataTransferItemList` is only valid during its own event's dispatch, so an `async` handler
     * that awaits first reads an empty drop. This handler is deliberately not `async`.
     */
    const entries = entriesFromDrop(event.dataTransfer)
    if (entries.length > 0) {
      upload.startWalk(entries)
      return
    }
    // No entry API on this drop — flat, into the current folder. A degradation, not a failure.
    const flat = filesFromDropList(event.dataTransfer)
    if (flat.length > 0) upload.start(flat)
  }

  /* Phase 2's `folderBreadcrumbs`: `{ path, name, depth, isCurrent }` per crumb, root first and
   * always present, and `isCurrent` is carried so the last crumb renders as text without this
   * component recomputing which one it is. On the media arm `page.folder` is `''`, so the trail is
   * exactly the Album crumb — and the Media crumb is appended in the JSX below rather than faked
   * into a `FolderCrumb`, because a fake path in the type would be a lie the breadcrumb then had
   * to special-case. */
  const trail = folderBreadcrumbs(folder)

  return (
    <div>
      {/* ── TOOLBAR ─────────────────────────────────────────────────────────────────────────
          Two rows below `lg` — crumbs over controls — and one flex line at `lg`, unchanged from
          what shipped. `lg:contents` on the control group is what buys that: at `lg` the wrapper
          stops generating a box and its five children become direct items of the toolbar's flex
          line again, in the same order, with the same gap. The alternative was a `basis-full
          lg:basis-auto` on the crumbs, which puts `flex` (a shorthand that sets `flex-basis`) and
          `flex-basis` in the same declaration and leaves the winner to Tailwind's emission order —
          and `lib/cn.ts` is a plain join, so there is no merge library to arbitrate that. */}
      <div className="mb-4 space-y-2 lg:flex lg:flex-wrap lg:items-center lg:gap-3 lg:space-y-0">
        <nav aria-label="Breadcrumb" className="min-w-0 lg:flex-1">
          <ol className="flex min-w-0 flex-wrap items-center gap-1 text-[13px] font-medium">
            {trail.map((crumb, index) => (
              <li key={crumb.path} className="flex min-w-0 items-center gap-1">
                {index > 0 && <span className="text-ink-3">/</span>}
                {crumb.isCurrent ? (
                  <span className="truncate font-semibold text-ink" aria-current="page">
                    {crumb.name}
                  </span>
                ) : (
                  /* A crumb is the primary way back up the tree on a phone, so it is a tap target
                     and not a 16 px word. `py-*` and not `TOUCH_ICON`: `truncate` needs a block,
                     and a flex box would make the text an anonymous flex item that `text-overflow`
                     never reaches. On the media arm this is how the operator leaves: the Album
                     crumb links to the album root. */
                  <Link
                    href={hrefFor(crumb.path)}
                    className="block min-w-0 truncate py-3 text-accent"
                  >
                    {crumb.name}
                  </Link>
                )}
              </li>
            ))}
            {/* The media arm's second crumb: Album (link, above) / Media (text). Rendered here and
                not folded into `trail`, because it is not a folder crumb and must never be fed back
                into `hrefFor` as a path. */}
            {view === 'media' && (
              <li className="flex min-w-0 items-center gap-1">
                <span className="text-ink-3">/</span>
                <span className="truncate font-semibold text-ink" aria-current="page">
                  {NINA_MEDIA_NODE_LABEL}
                </span>
              </li>
            )}
          </ol>
        </nav>

        <div className="flex flex-wrap items-center gap-2 lg:contents">
          <span className="shrink-0 text-[12px] font-semibold text-ink-3 tabular-nums">
            {view === 'media'
              ? `${page.total} in ${NINA_MEDIA_NODE_LABEL}`
              : `${page.total} in this folder`}
          </span>

          <input
            ref={folderInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={onPickFolder}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={onPickFolder}
          />

          {/* The drawer's handle. It does not exist at `lg`, where the rail is a column that is
              always on screen — so `aria-expanded` never lies about a control the operator can
              still see. The toolbar's buttons are icon-only (one row on a 414 px screen), so the
              accessible name is the `aria-label`, never the glyph — the same rule
              `AdminNavLinks.tsx` states for its links. */}
          <Button
            size="md"
            variant="secondary"
            className="lg:hidden"
            aria-expanded={treeOpen}
            aria-controls="admin-folder-rail"
            aria-label={treeOpen ? 'Hide the folders' : 'Show the folders'}
            onClick={() => setTreeOpen(!treeOpen)}
          >
            <PanelLeftIcon className="size-5" />
          </Button>

          {/* The two Add buttons are album verbs in this phase: they walk a laptop folder and
              register `nina_avatars` rows in the open folder, which is not what Media is. They
              return with the migrated carrier-message upload (phase 2), which is a different flow
              with a different pre-check — hidden here, not disabled, because a disabled button
              advertises an action that does not exist yet. */}
          {view === 'album' && (
            <>
              <Button
                size="md"
                variant="secondary"
                aria-label="Add photos"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlusIcon className="size-5" />
              </Button>
              <Button
                size="md"
                aria-label="Add a folder"
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderPlusIcon className="size-5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── THE COLUMNS ─────────────────────────────────────────────────────────────────────
          Two rails and a canvas at `lg`, exactly as `app/admin/layout.tsx` argued for. ONE column
          below it, in DOM order: rail (hidden unless opened), content, details. R1 revisits F33
          R23's *"this UI is for desktop"* premise, not the desktop layout it produced — the tracks
          at `lg` are the same three, at the same widths. */}
      <div
        className={cn(
          'grid grid-cols-1 items-start gap-4 lg:gap-5',
          selected != null
            ? 'lg:grid-cols-[200px_minmax(0,1fr)_320px]'
            : 'lg:grid-cols-[200px_minmax(0,1fr)]',
        )}
      >
        <div id="admin-folder-rail" className={cn(treeOpen ? 'block' : 'hidden', 'lg:block')}>
          <FolderTree
            folders={folders}
            current={folder}
            view={view}
            hrefFor={hrefFor}
            mediaHref={mediaHref}
            mediaCount={mediaCount}
            allFolders={allFolders}
            onNavigate={navigateToFolder}
            onFolderCreated={addPendingFolder}
          />
        </div>

        <div
          className="min-w-0"
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div
            className={cn(
              'rounded-card border p-4 transition-colors',
              dragging
                ? 'border-accent bg-accent-soft ring-2 ring-accent ring-inset'
                : 'border-rule bg-card',
            )}
          >
            {/* PHASE 6. Move / remove for the selection. Returns `null` when nothing is
                selected, so the grid's layout does not shift on an empty selection. MEDIA rows are
                excluded by `origin`, not by id-matching, because the bar's two verbs are
                `nina_avatars` actions and a message-image id is not one of theirs — handing it
                over would be offering a move of a row that is not filed anywhere. Phase 2 lifts
                the media verbs; until then the bar is album-only. */}
            <PhotoMoveBar
              selectedId={selected != null && selected.origin === 'album' ? selected.id : null}
              folders={allFolders}
              folder={folder}
              currentId={photos.find((photo) => photo.isCurrent)?.id ?? null}
              onDone={() => setSelectedId(null)}
            />

            <PhotoGrid
              photos={photos}
              page={page}
              view={view}
              selectedId={selected?.id ?? null}
              onSelect={select}
              hrefForPage={hrefForPage}
            />
          </div>

          <UploadQueue
            phase={upload.phase}
            items={upload.items}
            report={upload.report}
            error={upload.error}
            onDismiss={upload.dismiss}
          />
        </div>

        {selected != null && (
          <SelectionPane
            photo={selected}
            shareOrigin={shareOrigin}
            onClose={() => setSelectedId(null)}
            onRemoved={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  )
}
```

**5c.** After `hrefForFolder` (keep it byte-identical), add:
```tsx
/**
 * The grammar's media arm: `?view=media&page=N`. The KEY comes from `lib/admin/filetree.ts` and the
 * value is matched by `readExplorerView` there, so the writer and the reader of the parameter
 * cannot drift — the same reason `hrefForFolder` and `validateFolderPath` agree by construction.
 * Page 1 is the absence of `?page=`, as in the album arm, so the canonical
 * `/admin/nina?view=media` and a navigated-back-to first page are the same URL.
 */
function hrefForMediaView(page: number): string {
  const params = new URLSearchParams()
  params.set(NINA_MEDIA_VIEW_PARAM, NINA_MEDIA_VIEW_VALUE)
  if (page > 1) params.set('page', String(page))
  return `/admin/nina?${params.toString()}`
}
```
The three icon functions and the header docstring block below/above them are unchanged, except the
header's first section gains one paragraph after the URL-grammar paragraph (`:30-39`):
```
 * ── THE MEDIA VIEW IS THE SAME CHROME OVER A DIFFERENT TABLE ─────────────────────────────────
 * `?view=media` swaps the content pane to the conversation's photographs (`nina_message_images`,
 * both kinds) while the tree, the breadcrumb and the layout stay put — a pinned sibling in the
 * tree, not a route. That is why `view` arrives as a PROP and not as a `useSearchParams` read: the
 * page already awaited the parameter, and a second parse would be a second opinion about the URL.
 * On this view the explorer is deliberately verb-less — no Add buttons, no drop, no move bar —
 * because every media verb is an avatar action today, and an action refused is quieter than an
 * action misfiled. Phase 2 lifts the guards and the buttons return.
```
**Impact:** album view behaves identically (same hrefs, same controls, same layout). The media view
is navigable (tree row, breadcrumb, pager) and refuses every album verb.

### Step 6: `FolderTree` — the pinned Media row
**File:** `components/admin/explorer/FolderTree.tsx`
**Change:** `Row` becomes the one row-drawer for folders AND the media row (it takes the
right-hand affordance as a node); the Media row is pinned LAST inside the root's `<ul>`; the
active-row test keys on `view`, because Media and the album root share the path value `''`.

**6a.** Replace the imports (`:3-11`) with:
```tsx
'use client'

import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'

import { FolderMenu } from '@/components/admin/FolderMenu'
import { TOUCH_ICON } from '@/components/admin/touch'
import {
  buildTree,
  folderAncestors,
  mediaViewNode,
  type ExplorerView,
  type FolderNode,
} from '@/lib/admin/filetree'
import { cn } from '@/lib/cn'

import type { ExplorerFolder } from './model'
```

**6b.** Replace `export function FolderTree(...) { ... }` (`:46-136`) with:
```tsx
export function FolderTree({
  folders,
  current,
  view,
  hrefFor,
  mediaHref,
  mediaCount,
  allFolders,
  onNavigate,
  onFolderCreated,
}: {
  folders: readonly ExplorerFolder[]
  /** `''` is the album root. Unread while `view` is `'media'` — no folder is open then. */
  current: string
  /**
   * Which collection is open. The active-row test is `view === 'album' && current === path`, and
   * the `view` half is not decoration: Media and the album root SHARE the path value `''`, so a
   * path-only test would highlight "Album" while Media's grid is on screen.
   */
  view: ExplorerView
  /** Built by `FileExplorer` so the URL grammar has one home. Folder rows only. */
  hrefFor: (folder: string) => string
  /** The Media row's href — the same grammar's other arm, also built by `FileExplorer`. A plain
   * string and not a callback, because a view has no path to rebuild it around. */
  mediaHref: string
  /** How many photographs the Media view holds in total — the pinned row's badge. */
  mediaCount: number
  /**
   * PHASE 6. Every folder path the album knows about — the server's list merged with the ones
   * created in this session. `FolderMenu`'s "Move to…" universe and its collision hint, which is
   * why it is a flat `string[]` and not the `{ folder, count }` rows `buildTree` reads.
   */
  allFolders: readonly string[]
  /**
   * PHASE 6. `hrefFor` builds a URL; this navigates to one. A folder operation lands on the server
   * and *then* decides where the explorer should be looking, so the menu cannot express that as a
   * `<Link>` written before the click.
   */
  onNavigate: (folder: string) => void
  /** PHASE 6. A folder the server just declared, so it joins the tree before the next read. */
  onFolderCreated: (folder: string) => void
}) {
  /*
   * `buildTree` returns ONE root node, not an array — phase 2's shape, reconciled from the draft's
   * `FolderNode[]`. That is the better shape here and it deletes code: the root's label, its
   * subtree total and whether it has anything to expand all come off the node instead of being
   * recomputed in this component (the draft summed `folders` by hand for the root's count, which
   * was a second opinion about a number `totaliseFolderNode` had already worked out).
   *
   * `ExplorerFolder` is `{ folder: string; count: number }`, which is structurally phase 2's
   * `FolderCount` — so it goes straight in with no mapping. MEDIA is not in this call: the pinned
   * node is built separately below, because putting it through `buildTree` would hand it a path
   * and make it a folder — the exact thing the view must not be.
   */
  const root = useMemo(() => buildTree(folders), [folders])
  const albumOpen = view === 'album'
  /* Expansion follows the open FOLDER only. On the media arm nothing is "on the path", so the tree
     renders collapsed — the operator's place is a view, not a node, and no folder should pretend
     otherwise. */
  const onPath = useMemo(
    () => new Set(albumOpen ? [...folderAncestors(current), current] : []),
    [albumOpen, current],
  )
  const [override, setOverride] = useState<Record<string, boolean>>({})

  /* The per-folder menu, built here so `Row` stays a pure row-drawer. The MEDIA row passes
     `menu={null}`: a view has no folder verbs, and a menu on it would offer to rename or delete
     something that cannot exist. */
  const folderMenu = (path: string, photoCount: number) => (
    <FolderMenu
      folder={path}
      folders={allFolders}
      photoCount={photoCount}
      onNavigate={onNavigate}
      onFolderCreated={onFolderCreated}
    />
  )

  /* `mediaViewNode` clamps and names; the component only renders what it is told. */
  const media = mediaViewNode(mediaCount)

  return (
    <nav aria-label="Folders" className="rounded-card border border-rule bg-card p-3">
      <p className="mb-2 px-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
        Folders
      </p>

      <Row
        href={hrefFor('')}
        label={root.name}
        count={root.totalCount}
        depth={0}
        active={albumOpen && current === ''}
        chevron={root.children.length > 0 ? 'open' : 'none'}
        onToggle={undefined}
        menu={folderMenu('', root.totalCount)}
      />

      <ul className="mt-0.5">
        {root.children.map((node) => (
          <Branch
            key={node.path}
            node={node}
            depth={1}
            current={current}
            albumOpen={albumOpen}
            onPath={onPath}
            override={override}
            setOverride={setOverride}
            hrefFor={hrefFor}
            allFolders={allFolders}
            onNavigate={onNavigate}
            onFolderCreated={onFolderCreated}
          />
        ))}

        {/* The pinned virtual sibling — the user's "posisinya dibawah folder Album". LAST of the
            root's children, because the requirement put Media BELOW the album, and first would
            make it read as one more folder. `MediaViewNode` guarantees it carries no `path` and no
            `children`, so the only thing this row can do is navigate — no chevron, no menu, no
            subtree, and nothing for `FolderMenu` or `findFolderNode` to be wrong about. */}
        <li>
          <Row
            href={mediaHref}
            label={media.name}
            count={media.count}
            depth={1}
            active={view === 'media'}
            chevron="none"
            menu={null}
          />
        </li>
      </ul>

      {/* SEAM — PHASE 6, TAKEN. The folder-maintenance affordances landed in `Row` below rather
          than as a separate "New folder" button under this nav: `FolderMenu` carries all four
          verbs, and putting **New subfolder** inside the per-folder menu means the parent is the
          folder whose menu was opened rather than whichever folder the rail happens to have
          selected — one fewer thing for the operator to check before clicking. The root's own Row
          renders the menu too, with only that one item, which is where a top-level folder is
          created. The Media row renders none: a view is not a folder and gets no folder verbs. */}
    </nav>
  )
}
```
(The `aria-label` changes from "Album folders" to "Folders" for the same reason the row exists:
the nav now holds a row that is not a folder, and a label that misdescribes its contents is the
accessible name lying.)

**6c.** Replace `function Branch(...) { ... }` (`:138-206`) with:
```tsx
function Branch({
  node,
  depth,
  current,
  albumOpen,
  onPath,
  override,
  setOverride,
  hrefFor,
  allFolders,
  onNavigate,
  onFolderCreated,
}: {
  node: FolderNode
  depth: number
  current: string
  /* Forwarded so every level's active test carries the `view` half, not just the root's. */
  albumOpen: boolean
  onPath: ReadonlySet<string>
  override: Record<string, boolean>
  setOverride: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  hrefFor: (folder: string) => string
  /* PHASE 6, forwarded through the recursion exactly as `hrefFor` already is. */
  allFolders: readonly string[]
  onNavigate: (folder: string) => void
  onFolderCreated: (folder: string) => void
}) {
  const hasChildren = node.children.length > 0
  const open = override[node.path] ?? onPath.has(node.path)

  return (
    <li>
      <Row
        href={hrefFor(node.path)}
        label={node.name}
        count={node.totalCount}
        depth={depth}
        active={albumOpen && current === node.path}
        chevron={hasChildren ? (open ? 'open' : 'closed') : 'none'}
        onToggle={
          hasChildren
            ? () => setOverride((previous) => ({ ...previous, [node.path]: !open }))
            : undefined
        }
        menu={
          <FolderMenu
            folder={node.path}
            folders={allFolders}
            photoCount={node.totalCount}
            onNavigate={onNavigate}
            onFolderCreated={onFolderCreated}
          />
        }
      />
      {hasChildren && open && (
        <ul>
          {node.children.map((child) => (
            <Branch
              key={child.path}
              node={child}
              depth={depth + 1}
              current={current}
              albumOpen={albumOpen}
              onPath={onPath}
              override={override}
              setOverride={setOverride}
              hrefFor={hrefFor}
              allFolders={allFolders}
              onNavigate={onNavigate}
              onFolderCreated={onFolderCreated}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
```

**6d.** Replace `function Row(...) { ... }` (`:208-307`) with:
```tsx
/**
 * One row — and now the ONLY drawer of tree rows, folders and the media view alike. The media row
 * borrows the folders' exact geometry (same 44 px box, same count column, same label x-position
 * via the chevron spacer) rather than drifting from it, which is why the right-hand affordance is
 * a SLOT and not a hardcoded `FolderMenu`: a view passes `menu={null}` and gets a row with nothing
 * to click but the link.
 */
function Row({
  href,
  label,
  count,
  depth,
  active,
  chevron,
  onToggle,
  menu,
}: {
  href: string
  label: string
  count: number
  depth: number
  active: boolean
  chevron: 'open' | 'closed' | 'none'
  onToggle?: () => void
  /** The row's right-hand affordance. Folder rows render `FolderMenu` (New subfolder / Rename /
   * Move to… / Delete); the Media row renders none — a view has no folder verbs, and offering them
   * against something that cannot exist would be the pane lying about the model. */
  menu?: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex min-h-11 items-center gap-1 rounded-chip pr-1',
        active ? 'bg-accent-soft' : 'hover:bg-paper-2',
      )}
      style={{ paddingLeft: `${depth * 12}px` }}
    >
      {/* The spacer matches the chevron's new box exactly, which is the whole point of it: a leaf
          and its expandable sibling have to put their labels on the same x. The media row's spacer
          keeps ITS label on that x too, which is what makes it read as a sibling and not as a
          footer. */}
      {chevron === 'none' ? (
        <span className="w-11 shrink-0" aria-hidden="true" />
      ) : (
        <button
          type="button"
          onClick={onToggle}
          disabled={onToggle == null}
          aria-label={chevron === 'open' ? `Collapse ${label}` : `Expand ${label}`}
          className={cn(TOUCH_ICON, 'shrink-0 text-ink-3 disabled:opacity-40')}
        >
          <span
            aria-hidden="true"
            className={cn(
              'inline-block border-y-[4px] border-l-[6px] border-y-transparent border-l-current transition-transform',
              chevron === 'open' && 'rotate-90',
            )}
          />
        </button>
      )}

      {/*
       * `py-3` and NOT `TOUCH_TARGET` + `flex items-center`. `truncate` is
       * `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`, and on a flex container the
       * text becomes an anonymous flex item that `text-overflow` never applies to — the label
       * would clip with no ellipsis. Padding keeps the link a block, keeps the ellipsis, and
       * 12 + ~20 + 12 is the 44 px the row is asking for.
       */}
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'min-w-0 flex-1 truncate py-3 text-[13px] font-medium',
          active ? 'text-ink' : 'text-ink-2',
        )}
        title={label}
      >
        {label}
      </Link>

      <span className="shrink-0 px-1 text-[11px] font-semibold text-ink-3 tabular-nums">
        {count}
      </span>

      {menu}
    </div>
  )
}
```
Note what `Row` lost and why: `path`, `totalCount`, `allFolders`, `onNavigate`, `onFolderCreated`
existed only to build `FolderMenu` inside the row. The menu element is now built by the caller
(`FolderTree`'s `folderMenu` helper / `Branch`), so those five props are gone and the delete-panel
counting distinction the old `totalCount` doc argued for moved into `Branch`/`FolderTree` where the
menu is built. The rendered output for folder rows is unchanged.
**Impact:** folder tree renders identically (DOM diff: the nav's `aria-label`); one new pinned
row; no folder path anywhere can name Media.

### Step 7: `PhotoGrid` — view-aware empty state
**File:** `components/admin/explorer/PhotoGrid.tsx`
**Change:** one prop and the empty-state copy. The tiles are untouched — `photo.thumbUrl ??
photo.url` already renders media originals (media `thumbUrl` is typed `null`, so the fallback is
the only path), the "Hers" ribbon can never fire (`isCurrent: false`), and the pager's
`hrefForPage` arrives already view-aware from `FileExplorer`. Styling is Phase 4's edit.

**7a.** Replace the model import (`:9`) with:
```ts
import type { ExplorerPageInfo, ExplorerPhoto } from './model'
import type { ExplorerView } from '@/lib/admin/filetree'
```

**7b.** Replace the props block and the empty branch (`:37-74`) with:
```tsx
export function PhotoGrid({
  photos,
  page,
  view,
  selectedId,
  onSelect,
  hrefForPage,
}: {
  photos: readonly ExplorerPhoto[]
  page: ExplorerPageInfo
  /** Which collection this grid is. Only the EMPTY copy branches on it — a tile is a tile, and
   * the view has no other rendering consequence here. */
  view: ExplorerView
  selectedId: string | null
  onSelect: (id: string) => void
  hrefForPage: (page: number) => string
}) {
  const first = (page.page - 1) * page.pageSize + 1
  const last = Math.min(page.page * page.pageSize, page.total)
  const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize))

  if (photos.length === 0) {
    /* The empty copy names the collection, because "drop a folder" is a lie over Media and
       "this folder" is a lie about a view. An over-shot page says the same thing on both arms —
       the pager is the same pager. */
    const onFirstPage = page.page <= 1
    return (
      <EmptyState
        title={
          onFirstPage
            ? view === 'media'
              ? 'Nothing in Media yet'
              : 'Nothing in this folder yet'
            : 'Nothing on this page'
        }
        description={
          onFirstPage
            ? view === 'media'
              ? 'Photographs from the conversation land here — hers and his, newest first.'
              : 'Drop a folder from Explorer, or add photos with the buttons above.'
            : 'This folder is not that long any more.'
        }
        action={
          page.page > 1 ? (
            /* `ButtonLink`, not a `Button` inside a `Link`: a <button> nested in an <a> is
               invalid HTML and the barrel exports this exact component for this exact case. */
            <ButtonLink href={hrefForPage(1)} size="md" variant="secondary">
              Go to the first page
            </ButtonLink>
          ) : undefined
        }
      />
    )
  }
  // ...the rest of the component (the grid `<ul>` and the pager) is unchanged.
```
**Impact:** album rendering byte-identical; media arm gets an honest empty state.

### Step 8: `SelectionPane` — the read-only media arm
**File:** `components/admin/explorer/SelectionPane.tsx`
**Change:** the pane narrows on `photo.origin` and returns a READ-ONLY pane for media rows — hero
image, facts, Download — via an early return placed AFTER all hooks. The album path below it is
byte-identical. This is the "selection opens the pane read-only at worst" deliverable: every
control the album pane has addresses a `nina_avatars` row and would refuse (or worse, no-op
silently) against a message-image id, so none of them renders.

**8a.** Replace the filetree import (`:25`) with:
```ts
import { folderBreadcrumbs, NINA_MEDIA_NODE_LABEL } from '@/lib/admin/filetree'
```

**8b.** In the header docstring, after the "`description` IS NEVER RENDERED" section (`:66-70`),
append:
```
 * ── THE MEDIA ARM IS READ-ONLY, AND THE EARLY RETURN IS THE POINT ───────────────────────────
 * A media row (`photo.origin === 'media'`) is a `nina_message_images` row. Every control this pane
 * has otherwise — the framing pair, set-current, share, describe, remove — addresses an
 * `nina_avatars` row by id and would refuse it (or, worse, no-op against some other row). So the
 * media arm returns its own pane: the photograph, the facts, and the one verb that is client-only.
 * That is not a stub; it is the phase's contract — no new verbs — made structural. Phase 2 lifts
 * replace/remove/adopt into this arm; phase 3 replaces the describe story on both arms.
```

**8c.** Replace the `trail` computation (`:140-145`) with:
```tsx
  /* `folderBreadcrumbs` (phase 2's name; the draft assumed `breadcrumbFor`) returns crumbs of
   * `{ path, name, depth, isCurrent }` — so the label is `name`, and the root's own name is
   * `NINA_FOLDER_ROOT_LABEL`, which is why "Album" needs no special case here.
   *
   * A MEDIA row is filed nowhere: its trail is the view it lives in, not a folder path — printing
   * "Album" for it (what `folderBreadcrumbs('')` would say) would be the pane misnaming its own
   * subject. */
  const trail =
    photo.origin === 'media'
      ? NINA_MEDIA_NODE_LABEL
      : folderBreadcrumbs(photo.folder)
          .map((crumb) => crumb.name)
          .join(' / ')
```

**8d.** Immediately after the `trail` computation and BEFORE the album `return (` (:147), insert
the media arm:
```tsx
  /*
   * THE MEDIA ARM. Placed after every hook (states, `useSavePhoto`, the scroll effect) and before
   * the album JSX, so both arms share the machinery and neither can skip a hook — the React rules
   * and the honesty rule agree for once. `draft`/`dirty`/`run` simply go unused on this arm; they
   * are not dead code, they are the other arm's.
   */
  if (photo.origin === 'media') {
    return (
      <aside ref={paneRef} className="rounded-card border border-rule bg-card p-4 lg:p-5">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink" title={photo.filename}>
              {photo.filename}
            </p>
            <p className="truncate text-[12px] font-medium text-ink-3" title={trail}>
              {trail}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the details pane"
            className={cn(TOUCH_ICON, '-mt-2 -mr-2 shrink-0 text-[15px] font-semibold text-ink-3')}
          >
            &times;
          </button>
        </div>

        {/* The photograph itself, whole and un-transformed — the same ruling PhotoGrid's header
            records against `next/image` for Blob-hosted files, and no studio around it: framing is
            an avatar concept until adoption copies these bytes into a row that can carry one. */}
        <div className="overflow-hidden rounded-chip border border-rule bg-paper-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted and deliberately
              un-transformed; see PhotoGrid's header. */}
          <img
            src={photo.url}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="max-h-[420px] w-full object-contain"
          />
        </div>

        {/* The facts, in the album pane's vocabulary. `Side` is `photoSideOf`'s answer and
            `Source` is the table's own kind; both English (`AlbumManager.tsx:233`'s rule for /admin
            copy). The description row stays PRESENCE-ONLY (invariant 5): whether she can talk
            about it, never the prose — the prose is glm-4.6v's private text about her photograph. */}
        <dl className="mt-5 space-y-1 border-t border-rule pt-4 text-[12px] font-medium text-ink-3">
          <div className="flex gap-2">
            <dt>Side</dt>
            <dd className="text-ink-2">{photo.side === 'hers' ? 'Hers' : 'His'}</dd>
          </div>
          <div className="flex gap-2">
            <dt>Source</dt>
            <dd className="text-ink-2">{photo.source}</dd>
          </div>
          <div className="flex gap-2">
            <dt>Pixels</dt>
            <dd className="text-ink-2 tabular-nums">
              {photo.width ?? '?'} &times; {photo.height ?? '?'}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt>Thumbnail</dt>
            <dd className="text-ink-2">None — the grid loads the original</dd>
          </div>
          <div className="flex gap-2">
            <dt>Nina</dt>
            <dd className="text-ink-2">
              {photo.description == null
                ? 'Cannot talk about this photo yet'
                : 'Can talk about this photo'}
            </dd>
          </div>
        </dl>

        {/* The one control. Download is `useSavePhoto`'s ladder — all client-side — so it is the
            only verb this phase can offer a media row without lifting a guard that phase 2 owns.
            `pending` is never true here (no server action can run on this arm), so there is no
            loading slot and no `error` paragraph: nothing can fail. */}
        <div className="mt-5 flex flex-wrap items-center gap-1 border-t border-rule pt-4">
          <Button
            size="md"
            variant="secondary"
            className={RAIL_BUTTON}
            loading={saver.busy}
            aria-label="Download this photo"
            title="Download this photo"
            onPointerDown={saver.warm}
            onFocus={saver.warm}
            onClick={saver.save}
          >
            <DownloadIcon className="size-4" />
          </Button>

          {saver.notice !== null && (
            <p className="basis-full text-[12px] font-medium text-ink-3">
              {SAVE_NOTICE_TEXT[saver.notice]}
            </p>
          )}
        </div>
      </aside>
    )
  }
```
**Impact:** album selections behave exactly as before (the code below the early return is
untouched). Media selections open a pane that cannot misfile an avatar action. The TS narrowing on
`photo.origin === 'media'` means the media JSX reads `photo.side`/`photo.prompt` etc. with full
types, and the album JSX below is narrowed to `AlbumExplorerPhoto`.

### Step 9: Unit tests — the filetree additions
**File:** `tests/admin.filetree.test.ts`
**Change:** extend the import list (`:8-40`) with `mediaViewNode`, `readExplorerView`,
`NINA_MEDIA_NODE_LABEL`, `NINA_MEDIA_VIEW_PARAM`, `NINA_MEDIA_VIEW_VALUE` (alphabetical into the
existing `@/lib/admin/filetree` import), then append two suites at the end of the file:
```ts
/* ── The Media view ───────────────────────────────────────────────────────────────────────── */

describe('readExplorerView', () => {
  it('reads ?view=media and falls back to the album for everything else', () => {
    expect(readExplorerView(NINA_MEDIA_VIEW_VALUE)).toBe('media')
    for (const notMedia of [undefined, '', 'Media', 'media ', 'album', 'albums', 'chat']) {
      // Strict value match, and the fallback is the album — the bare URL's meaning since forever.
      // A view that degraded to an error would turn one stale link into a broken screen.
      expect(readExplorerView(notMedia)).toBe('album')
    }
  })

  it('takes the first of a repeated parameter, the readOne idiom the page uses', () => {
    expect(readExplorerView(['media', 'album'])).toBe('media')
    expect(readExplorerView(['album', 'media'])).toBe('album')
    expect(readExplorerView([])).toBe('album')
  })

  it('binds the writer to the reader: the constant is what the parser matches', () => {
    // `hrefForMediaView` (FileExplorer) writes this pair and this parser reads it; if they drift,
    // the tree row navigates to a URL the page reads as the album. One assertion, both ends.
    expect(NINA_MEDIA_VIEW_PARAM).toBe('view')
    expect(readExplorerView(NINA_MEDIA_VIEW_VALUE)).toBe('media')
  })
})

describe('mediaViewNode', () => {
  it('pins the label and clamps the count the way buildTree clamps an entry', () => {
    expect(mediaViewNode(0)).toEqual({ view: 'media', name: NINA_MEDIA_NODE_LABEL, count: 0 })
    expect(mediaViewNode(137)?.count).toBe(137)
    expect(mediaViewNode(Number.NaN)?.count).toBe(0)
    expect(mediaViewNode(-5)?.count).toBe(0)
    expect(mediaViewNode(3.9)?.count).toBe(3)
  })

  it('is NOT a FolderNode: no path, no children, no depth', () => {
    const node = mediaViewNode(4)
    expect('path' in node).toBe(false)
    expect('children' in node).toBe(false)
    expect('depth' in node).toBe(false)
    // The structural reason the view cannot leak into the folder world: findFolderNode,
    // isFolderAncestorOf and FolderMenu all consume a `path`, and this node has none to give.
  })

  it('leaves the folder grammar unreserved: "Media" stays a legal folder path', () => {
    // The view is distinguished by KEY (?view= vs ?folder=), never by a reserved path value — so
    // an operator who genuinely wants a folder called "Media" can still create one, and nothing
    // in validateFolderPath needed an exception to allow it.
    expect(validateFolderPath(NINA_MEDIA_NODE_LABEL)).toMatchObject({ ok: true })
  })
})
```
**Impact:** none on other suites. `buildTree`'s existing suite is untouched because `buildTree` is
untouched — the media node is a sibling built beside it, never inside it.

### Step 10: Unit tests — the media read's SQL contract
**File:** `tests/nina.photoRefs.test.ts`
**Change:** the recording-driver pattern already in this file asserts the real generated SQL, and
the media read has one contract worth more than any spy: it skips references (like the generated
pair) and carries NO `kind` filter (unlike them). The file's only imports today are `vitest` and
`./support/fakeDb`, so add one new import after them —
`import { NINA_CHAT_PHOTO_PAGE_SIZE } from '@/lib/nina/album'` — then append:
```ts
describe('the Media view read — /admin/nina?view=media (image-collection phase 1)', () => {
  it('listNinaMediaPhotos — BOTH statements skip a reference and NEITHER carries a kind arm', async () => {
    fake.enqueue([], [[0]])
    await queries.listNinaMediaPhotos('u1')

    expect(fake.queries).toHaveLength(2)
    for (const query of fake.queries) {
      const where = whereOf(query.sql)
      for (const predicate of REFERENCE_SKIPPED) expect(where, query.sql).toContain(predicate)
      expect(where).toContain('"user_id" = $')
      // The superset property, asserted as an ABSENCE for the same reason invariant 2's is: his
      // composer uploads (`kind = 'upload'`) are members of this collection, and a `kind` filter
      // here would silently hide every photograph he attached himself.
      expect(where).not.toContain('"kind" =')
    }
    // The pager's two statements, in one round trip: page of rows, then the total.
    expect(fake.sqlAt(0)).toContain('limit')
    expect(fake.sqlAt(0)).toContain('offset')
  })

  it('countNinaMediaPhotos — the tree badge counts the same set the page lists', async () => {
    fake.enqueue([[7]])
    await expect(queries.countNinaMediaPhotos('u1')).resolves.toBe(7)

    const where = whereOf(fake.only().sql)
    for (const predicate of REFERENCE_SKIPPED) expect(where, predicate).toContain(predicate)
    expect(where).not.toContain('"kind" =')
  })

  it('defaults and CEILINGS the page at NINA_CHAT_PHOTO_PAGE_SIZE, and floors the offset', async () => {
    // The cost argument travels with the number (`lib/nina/album.ts:80-105`: media tiles load
    // ORIGINALS), so a hand-edited limit must not be able to turn one page into the unpaginated
    // read the constant exists to prevent. Drizzle binds limit/offset as parameters, so the bound
    // is visible in `params`.
    fake.enqueue([], [[0]])
    await queries.listNinaMediaPhotos('u1', { limit: 10_000, offset: -5 })
    expect(fake.queries[0]?.params).toContain(NINA_CHAT_PHOTO_PAGE_SIZE)
    expect(fake.queries[0]?.params).not.toContain(10_000)
    expect(fake.queries[0]?.params).toContain(0)

    fake.reset()
    fake.enqueue([], [[0]])
    await queries.listNinaMediaPhotos('u1', { offset: 96 })
    expect(fake.queries[0]?.params).toContain(96)
  })
})
```
**Impact:** the existing suites are untouched; `/admin/photos`' generated-only contract keeps its
own assertions, now visibly the narrow one.

## Verification

**Build:** `npm run typecheck` — this is the page-contract gate too: it runs `next typegen` first,
which is what proves `PageProps<'/admin/nina'>` against the real generated types (`app/admin/photos`
' page header records why a bare `tsc` is not enough).
**Lint:** `npm run lint`
**Tests:** `npm run test` — the whole suite; the two extended files are
`npx vitest run tests/admin.filetree.test.ts tests/nina.photoRefs.test.ts` for a fast loop.
**Manual check** (needs `.env.local` + `npm install` in this worktree, and the app on a non-3000
port per house rules):
1. `/admin/nina` — unchanged: same folders, same grid, Add buttons present, drop works, crumbs read
   "Album / …".
2. `/admin/nina?view=media` — tree shows "Album" then "Media" with a count; the grid lists
   conversation photographs of BOTH kinds (his uploads visible), newest first, 48/page, pager
   links carry `view=media`; toolbar reads "N in Media"; crumbs read "Album / Media"; the Album
   crumb navigates back to the album view.
3. In media view: no Add buttons; a file drop does nothing (and the browser does not navigate away);
   clicking a tile opens a read-only pane (hero image, facts, Download; no framing, no set-current,
   no share, no describe, no remove) and `PhotoMoveBar` does not render.
4. `?view=media&folder=whatever` — folder ignored, media grid shown. `?view=Media` (capital) —
   album view. `?view=media&page=0` / `?page=-3` — page 1.
5. `/admin/photos` — still live and green, unchanged, generated-only.
6. A real folder named "Media" can still be created in the album (New subfolder → "Media") and
   behaves as a folder — proving the view is keyed, not reserved.

**Exit criteria:** `/admin/nina?view=media` lists every original conversation photo (both kinds,
orphans included, newest first, paginated at 48); the tree pane shows "Album" then "Media" with a
count; album folders behave exactly as before; `/admin/photos` untouched and green; lint, typecheck
and the full suite pass.

## Handoffs

- **Phase 2** owns every media verb: lift the `kind !== 'generated'` refusals, mount
  adopt/replace/remove/download-into-SelectionPane's media arm (this phase's early return is the
  insertion point — its "THE MEDIA ARM" comment names the seams), migrate the
  `ChatPhotoAdd`/`chatPhotoUpload` flow into the media view's toolbar (replacing this phase's
  refused drop and hidden Add buttons — the `useFolderUpload` hook stays mounted but idle until
  then), render the prompt toggle only when `prompt != null` (the field is already carried), and
  purge `/admin/photos` + `listNinaChatPhotos` + `NinaChatPhotoPage` (this phase deliberately did
  NOT touch them). `countNinaChatPhotos` and `generatedChatPhotoScope` are NOT part of the purge —
  the image-reference picker (`listNinaPhotoReferences`/`resolveNinaPhotoReference`, pinned by
  `tests/nina.imageprefs.test.ts:539-541`) is their remaining caller — so that phase keeps them
  and rewords only the docstrings this phase wrote about the hub card. If the Replace flow needs
  `pathname` on `MediaExplorerPhoto`, that phase adds the one field.
- **Phase 3** owns the unified describe panel on both arms — this phase's pane keeps `description`
  presence-only on both arms, and the media arm renders no describe control at all.
- **Phase 4** owns the `h1`/nav/dashboard renames (this phase's header copy branches on view but
  the `h1` is untouched) and the borderless grid restyle (this phase's `PhotoGrid` edit is copy
  only).
- **Opportunistic, non-blocking** (analysis reference list): the doc comments at
  `lib/nina/queries.ts:943,3956,3980` still say "/admin/photos" — they stay true through this
  phase and become stale only at Phase 2's purge, which should sweep them.

## Rollback

Single-phase revert: `git revert` of this phase's commit(s) on `feature/image-collection` restores
the pre-phase tree exactly — every change is additive (new exports, one union widening, one new
page arm, one new tree row) and no data, blob, route or schema changed. `/admin/photos` was never
touched, so nothing needs re-enabling. If only PART of the phase must be backed out, the seams are
independent in this order: Step 8 (pane arm) and Step 5's refusals can revert without Steps 1-4
(the `?view=media` URL would then render an album grid — remove the tree row in the same edit);
Steps 1-4 revert cleanly together.
