# Phase 5: The file explorer — tree, breadcrumb, paginated grid, drop zone, upload queue, set-as-profile

**Plan set:** `ADMIN_ALBUM_FILE_MANAGER_PLAN.md`
**Analysis:** `20260904-131215-A3F7_code_analyzer.md`
**Satisfies:** R1 — *"can we make it so that the in /admin/nina profile album, it looks like a file
manager instead? … i very much prefer we can upload folders instead (maybe also drag and drop
folders from my local win explorer into the page) … it automatically upload only the new folders
and files … automatically only upload image files … we can click a photo and select it as profile
picture."*
**Depends on:** Phase 4 (which depends on 1 and 2) — so this phase is written against the tree as
it looks after **1, 2 and 4** have landed.
**Difficulty:** HARD
**Package:** `components/admin`, `app/admin`

---

## Goal

`/admin/nina` stops being a flat grid of circles and becomes a file manager: a folder tree on the
left, a breadcrumb and a folder-scoped page of thumbnails in the middle, and a details rail on the
right that hosts the framing studio and the "Set as her profile picture" button. A nested folder
arrives either from a directory picker or dropped straight out of Windows Explorer; both feed one
bounded-concurrency upload queue that uploads **only the files the album does not already have**,
skips everything that is not an image, and derives a 256 px thumbnail beside each original so a
folder of hundreds renders without ever downloading a full-size photo. One page is
`NINA_ADMIN_PAGE_SIZE = 120` photographs (phase 1's number, reconciled from this phase's draft
assumption of 60).

After this phase there is exactly one upload path in `/admin`. `AlbumManager.tsx` and
`UploadAvatar.tsx` are gone.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

### Deletes

- `components/admin/AlbumManager.tsx` — whole file. Exports `AlbumManager`
  (`AlbumManager.tsx:47`) and `AlbumPhoto` (`AlbumManager.tsx:34`). Its one importer is
  `app/admin/nina/page.tsx:1`, which this phase rewrites. **Its framing pane
  (`AlbumManager.tsx:84-192`) moves verbatim in behaviour into
  `components/admin/explorer/SelectionPane.tsx`.**
- `components/admin/UploadAvatar.tsx` — whole file. Exports `UploadAvatar`
  (`UploadAvatar.tsx:43`). Its one importer is `AlbumManager.tsx:7`, also deleted. Its two
  documented rulings — *do not re-encode the original* (`UploadAvatar.tsx:26-33`) and *the browser
  measures the image* (`UploadAvatar.tsx:32-36`) — are carried forward, quoted, into
  `components/admin/explorer/thumbnail.ts` and `useFolderUpload.ts`.

- `registerNinaAvatarAction` (singular) from `lib/admin/ninaAlbumActions.ts:87`. **Reconciled:**
  phase 4 keeps it alive deliberately (*"a dangling export, or two upload paths that can disagree,
  would both be worse than one action with one caller for one more phase"*) and hands its
  retirement here, because `UploadAvatar.tsx` is its only caller and this phase deletes that file.
  It goes in the **same commit** as the component. Its schema, `avatarRegisterSchema`, stays —
  `tests/admin.avatars.test.ts` covers it and it costs nothing.

**Nothing else in the repo imports either file.** Verified: `grep -rn "AlbumManager\|UploadAvatar"`
matches only `app/admin/nina/page.tsx`, `components/admin/AlbumManager.tsx`,
`components/admin/UploadAvatar.tsx`, and three docstring references handled in Step 11.

### Renames

- `AlbumPhoto` (`components/admin/AlbumManager.tsx:34`) -> `ExplorerPhoto`
  (`components/admin/explorer/model.ts`). Not a pure rename: it gains `thumbUrl`, `folder` and
  `filename`, and it is imported by the page for the row -> prop mapping exactly as `AlbumPhoto`
  was.

### Creates

- `components/admin/FileExplorer.tsx` — `FileExplorer` (the screen body, `'use client'`)
- `components/admin/explorer/model.ts` — `ExplorerPhoto`, `ExplorerFolder`, `ExplorerPageInfo`,
  `QueueItemState`, `QueueItem`, `QueueReport` (types only; no runtime export, so it is safe in
  both graphs)
- `components/admin/explorer/thumbnail.ts` — `EXPLORER_THUMB_SHORT_EDGE_PX`,
  `EXPLORER_THUMB_QUALITY`, `EXPLORER_THUMB_CONTENT_TYPE`, `measureAndThumbnail`
- `components/admin/explorer/dropWalk.ts` — `EXPLORER_WALK_MAX_FILES`, `EXPLORER_WALK_MAX_DEPTH`,
  `WalkedFile`, `entriesFromDrop`, `walkEntries`, `filesFromPicker`, `filesFromDropList`
- `components/admin/explorer/useFolderUpload.ts` — `EXPLORER_UPLOAD_CONCURRENCY`,
  `EXPLORER_REGISTER_CHUNK`, `FolderUpload`, `useFolderUpload`
- `components/admin/explorer/FolderTree.tsx` — `FolderTree`
- `components/admin/explorer/PhotoGrid.tsx` — `PhotoGrid`
- `components/admin/explorer/SelectionPane.tsx` — `SelectionPane`
- `components/admin/explorer/UploadQueue.tsx` — `UploadQueue`

### Signature changes

- `app/admin/nina/page.tsx`: `export default async function AdminNinaPage()`
  (`page.tsx:22`, no props today) -> `export default async function AdminNinaPage(props: PageProps<'/admin/nina'>)`.
  Verified against this repo's own Next (16.3.1):
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`, "Page Props
  Helper" — *"You can type pages with `PageProps` to get strongly typed `params` and `searchParams`
  from the route literal. `PageProps` is a globally available helper."* `searchParams` is a
  **promise** and must be awaited. `app/admin/layout.tsx:44` already uses the sibling
  `LayoutProps<'/admin'>`, so this is the file convention already in the repo, not a new one.

### Requires (from earlier phases)

> **RECONCILED (round 1).** This block was the largest contract disagreement in the set: phase 5
> ran without sight of phases 1, 2 and 4 and guessed nine signatures. Every one below is now quoted
> from what those phases actually write, and the six that changed are flagged. Two of the guesses
> **won** the argument and moved the other phase instead: the pagination shape (offset + total, not
> a keyset cursor) and the batch bound's home (a module with no `zod` in it). The rest of this
> phase's steps were rewritten to match, so the call sites below are the reconciled ones and not
> the draft's.

**From phase 1 — `lib/nina/queries.ts`:**

```ts
/** One page of one folder, plus the folder's own (non-recursive) row count, for the pager. */
export interface NinaAvatarFolderPage {
  rows: NinaAvatarRow[]
  total: number
}

export async function listNinaAvatarsInFolder(
  userId: string,
  folder: string,
  opts?: { limit?: number; offset?: number },
): Promise<NinaAvatarFolderPage>

/** Every folder that holds at least one row, with its own (non-recursive) count. */
export interface NinaAvatarFolderCount {
  folder: string
  /** NOTE THE FIELD NAME: `photos`, not `count`. */
  photos: number
}

export async function listNinaAvatarFolders(userId: string): Promise<NinaAvatarFolderCount[]>
```

> **The pagination shape: this phase won, and phase 1 changed.** Phase 1's draft returned a keyset
> cursor (`NinaAvatarCursor` / `NinaAvatarPage { rows, nextCursor }`), and the plan index's own
> wording said "a page cursor" — so this phase was the one departing from the index, and it flagged
> the contradiction explicitly rather than adapting silently. It was right to. A file manager's
> pager says *"121–240 of 314"* and offers **Newer** as well as **Older**, and a cursor carries no
> count and walks one way unless the URL accumulates a stack of them; `?page=N` is also something a
> human can read, type and bookmark. At the scale the requirement states (*"hundreds"*) `OFFSET` on
> `nina_avatars_user_folder_created_idx` is an index range scan, and the deep-offset cost a cursor
> exists to avoid begins in the tens of thousands. `page.total` is read in three places on this
> screen (the pager's range, the toolbar's *"N in this folder"*, and the empty-page branch's
> "this folder is not that long any more"), and a cursor could supply none of them.
>
> **What the cursor was right about is now written on `NinaAvatarFolderPage`, not dropped.** Rows
> insert at the front of `(created_at desc, id desc)`, so a page-2 read taken *during* an upload is
> shifted and a tile can appear on two consecutive pages. Bounded and one-directional (a row can
> repeat, it cannot be skipped), and the operator watching an upload is watching the queue.
>
> Two smaller notes: `opts` is optional and `limit` is clamped to `NINA_ADMIN_PAGE_SIZE` inside the
> query, so this phase passes it explicitly and cannot exceed it. And `total` comes from its own
> `SELECT count(*)` rather than a window function, precisely so an over-shot `?page=` returns
> `rows: []` with a truthful total — which is what lets `PhotoGrid`'s empty state tell "nothing on
> this page" apart from "nothing in this folder yet".

**From phase 1 — `NinaAvatarRow` (`lib/nina/queries.ts:226`):** four new fields read by this phase —
`folder: string`, `filename: string | null`, `thumbUrl: string | null`,
`thumbPathname: string | null`. `sourceKey` is deliberately **not** on the row (phase 1's Step 6
note), which is fine: this phase writes the key and never reads it back off a row.

**From phase 1 — `lib/nina/album.ts`:**

```ts
/** One page of `/admin/nina`'s content pane. Both the DEFAULT and the CEILING. */
export const NINA_ADMIN_PAGE_SIZE = 120

/** The largest batch one register call may carry. THIS is the chunk size — see below. */
export const NINA_ADMIN_BATCH_MAX = 50
```

> **The page size: 120, not this phase's assumed 60.** Phase 1 justified 120 against what a page
> *costs* — 120 derived thumbnails is a few megabytes where 120 originals would be closer to half a
> gigabyte — and that is the argument that decides it, because the whole reason `thumb_url` exists
> is to make the page cheap. The grid draws 5–8 columns depending on whether the details rail is
> open, so 120 is 15–24 rows: two or three scrolls, and three pages for the 314-photo album the
> requirement describes rather than six. `loading="lazy"` on every tile means the rows below the
> fold cost nothing until they approach it, so the render argument for 60 does not survive contact
> with the lazy attribute this phase was already going to set. Wherever this plan's prose says
> "sixty tiles a page", read 120.

> **The batch bound: this phase won the *placement* argument and lost the *name*.** The draft asked
> phase 4 for an `ADMIN_AVATAR_REGISTER_MAX` exported from `lib/admin/avatars.ts`, on the grounds
> that reading a constant from `lib/admin/schema.ts` would pull `zod` into the `/admin/nina` browser
> bundle for the sake of one integer. **That hazard is real and it is honoured** — but the answer is
> `NINA_ADMIN_BATCH_MAX` in `lib/nina/album.ts`, which is phase 1's home for it and satisfies the
> constraint exactly: no `zod`, no `server-only`, no database import, and this phase already imports
> `NINA_AVATAR_FALLBACK_SRC` from it in a client component today. So there is no
> `ADMIN_AVATAR_REGISTER_MAX`, no fallback `EXPLORER_REGISTER_CHUNK`, and no `Math.min` between
> two constants: `useFolderUpload.ts` imports the one bound and chunks at it.

**From phase 1 — `lib/admin/avatars.ts`:**

```ts
/** `nina/<userId>/thumb-<id>.<ext>` — what the client asks for. THREE arguments. */
export function adminAvatarThumbPathname(userId: string, id: string, ext: AdminAvatarExt): string
```

> **Three arguments, not two.** The `ext` is required and is not defaulted, because the Route
> Handler cross-checks the pathname's extension against the `contentType` in `clientPayload` and a
> mismatch is a 400. This phase encodes the thumbnail as `image/jpeg`, so it passes `'jpg'`.
>
> Also: **phase 1's `ADMIN_AVATAR_THUMB_EDGE_PX` does not exist.** The reconciler deleted it and
> left the thumbnail's geometry here, in `components/admin/explorer/thumbnail.ts`, on this phase's
> own argument — nothing on the server re-encodes anything, so the short edge and the quality are
> not *agreed* values and do not belong in a shared module. `ADMIN_AVATAR_THUMB_MAX_UPLOAD_BYTES`
> (512 KB) does stay in `lib/admin/avatars.ts`, because the Route Handler genuinely shares it.

**From phase 2 — `lib/admin/filetree.ts`.** Every name and every shape here differs from the
draft's guesses; this is the reconciled list.

```ts
/** One walked file. NOTE: `relativePath` is relative to the DROP ROOT and includes the filename;
 *  the destination folder is passed separately as `base`, never prefixed onto this. */
export interface LocalFileLike {
  relativePath: string
  name: string
  type: string
  size: number
  lastModified: number
}

/** `''` is the album root. Windows `\`, `.`, empty and repeated segments normalise out.
 *  `..` SURVIVES normalisation on purpose — only `validateFolderPath` decides its fate. */
export function normaliseFolderPath(raw: string): string

export type FolderPathRejection =
  | 'too_deep' | 'path_too_long' | 'segment_too_long' | 'bad_segment' | 'traversal'
export type FolderPathResult =
  | { ok: true; path: string }
  | { ok: false; reason: FolderPathRejection; segment: string | null }
/** Normalises, then judges. The album root is `ok`. Total; never throws. */
export function validateFolderPath(raw: string): FolderPathResult

/** ONE root node, not an array. Intermediate folders are synthesized with `ownCount: 0`. */
export interface FolderNode {
  path: string
  name: string
  depth: number
  /** Filed directly here. */
  ownCount: number
  /** Including every descendant — what a COLLAPSED folder must show. */
  totalCount: number
  children: FolderNode[]
}
export interface FolderCount {
  folder: string | null
  count: number
}
export function buildTree(entries: readonly FolderCount[]): FolderNode
export function findFolderNode(root: FolderNode, path: string): FolderNode | null

/** `'a/b/c'` -> `['', 'a', 'a/b']`. STRICT ancestors, root first. `''` -> `[]`. */
export function folderAncestors(path: string): string[]

export interface FolderCrumb {
  path: string
  name: string
  depth: number
  isCurrent: boolean
}
/** `'a/b'` -> root crumb + one per segment. Always at least one entry. */
export function folderBreadcrumbs(path: string): FolderCrumb[]

export const NINA_FOLDER_ROOT = ''
export const NINA_FOLDER_ROOT_LABEL = 'Album'

/** MIME first, extension fallback for an empty `type`. `ext` and `contentType` always agree. */
export type FileRejection = 'not_an_image' | 'unsupported_image'
export type FileVerdict =
  | { ok: true; ext: NinaImageExt; contentType: NinaImageContentType; decidedBy: 'mime' | 'extension' }
  | { ok: false; reason: FileRejection }
export function classifyFile(file: { name: string; type: string }): FileVerdict

export type UploadRefusal =
  | FolderPathRejection | 'too_large' | 'empty_file' | 'unnamed' | 'name_too_long'
export type ExistingReason = 'already_uploaded' | 'duplicate_in_batch'

/** `source` is the CALLER'S OWN OBJECT, handed straight back. That is how the `File` rides along. */
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
  folders: string[]
  counts: { total: number; upload: number; existing: number; rejected: number; refused: number }
}
export interface ManifestEntryLike {
  sourceKey: string | null
}
export function planFolderUpload<T extends LocalFileLike>(input: {
  base: string
  files: readonly T[]
  manifest: readonly ManifestEntryLike[]
  maxBytes: number
}): FolderUploadPlan<T>
```

> **Five renames and three shape changes, all of them phase 2's to keep.** `ancestorsOf` →
> `folderAncestors`; `breadcrumbFor` → `folderBreadcrumbs` (and the crumb is
> `{ path, name, depth, isCurrent }`, not `{ label, folder }`); `uploadableContentType` →
> `classifyFile` (a verdict union, not a nullable content type); `UploadRefusalReason` →
> `UploadRefusal`, and it is a **wider** union — five members plus the five folder-path rejections,
> so `REFUSAL_TEXT` has ten entries; `buildTree` returns **one root node**, not an array, and its
> counts are `ownCount` / `totalCount`, not `count` / `subtreeCount`.
>
> **`planFolderUpload` is an options object, takes `base` separately, and takes `maxBytes`.** Three
> consequences at this phase's one call site, and each removes code rather than adding it:
> 1. **`base` is passed, not prefixed.** The draft built `path = destination + '/' + entry.path`
>    before calling. Phase 2 joins the base itself, per file, and validates the result — so the
>    walk hands over `relativePath` exactly as `webkitRelativePath` gave it.
> 2. **The `byKey` Map is deleted.** `PlannedUpload<T>.source` hands the caller's own object back,
>    which is what phase 2 designed it for, so the `File` rides along on the input object and
>    `planned.source.file` is the file. No key recomputation, no map, and no
>    `sourceKeyFor` call in this phase at all — which is just as well, because its real signature is
>    `{ folder, filename, size, lastModified }` over the *resolved* destination, which only
>    `planFolderUpload` knows.
> 3. **`maxBytes: ADMIN_AVATAR_MAX_UPLOAD_BYTES` is passed explicitly.** Phase 2 refuses to declare
>    a second 8 MB, on `lib/admin/avatars.ts`'s own rule, and this file already imports from that
>    module. One import, one argument.
>
> `plan.already` and `plan.rejected` were numbers in the draft and are arrays here; the numbers are
> `plan.counts.existing` and `plan.counts.rejected`. `plan.refused` entries carry `name`, not
> `path`.
>
> **`NinaAvatarBatchRecordLike` does not exist and was never phase 2's.** See the batch-record note
> under phase 4 below.

**From phase 4 — `lib/admin/ninaAlbumActions.ts` and `lib/admin/schema.ts`:**

```ts
/** THE ENVELOPE, not a bare array. `z.infer` of `avatarBatchRecordSchema`. */
export interface AvatarBatchRecord {
  folder: string
  filename: string
  sourceKey: string
  blobUrl: string
  pathname: string
  contentType: 'image/jpeg' | 'image/png' | 'image/webp'
  width: number
  height: number
  bytes: number
  /** A NESTED NULLABLE OBJECT, not two flat fields. `null` = the canvas encode failed. */
  thumb: { url: string; pathname: string } | null
}

export interface AdminBatchRegisterResult extends AdminActionResult {
  /** Keyed by the dedupe key the client sent, so order does not matter. */
  inserted?: { sourceKey: string; id: string }[]
  /** Submitted records that wrote nothing — already in the album, or duplicated in the batch. */
  skipped?: number
}
export async function registerNinaAvatarsAction(
  input: unknown,
): Promise<AdminBatchRegisterResult>

export interface AdminManifestEntry { id: string; folder: string; sourceKey: string }
export interface AdminManifestResult extends AdminActionResult {
  entries?: AdminManifestEntry[]
  truncated?: boolean
}
/** NAME AND SHAPE: `list…`, and it takes `{ folder }`. */
export async function listNinaAlbumManifestAction(input: unknown): Promise<AdminManifestResult>
```

> **Four corrections to the draft's assumptions, all in this phase's favour to fix:**
> 1. `readNinaAlbumManifestAction(folder)` → `listNinaAlbumManifestAction({ folder })`, returning
>    `entries` (an array of records) rather than `sourceKeys` (an array of strings). That is
>    strictly better here: `AdminManifestEntry` is assignable to phase 2's `ManifestEntryLike`, so
>    `result.entries` goes straight in with no mapping.
> 2. `registerNinaAvatarsAction(chunk)` → `registerNinaAvatarsAction({ records: chunk })`. The
>    envelope exists so a later field is additive rather than a shape change on an action this
>    phase already calls.
> 3. `inserted` is `{ sourceKey, id }[]`, not a count. An `ok` result means every record in the
>    chunk either inserted or was already present, so marking the whole chunk `done` stays correct;
>    `skipped` is the number the *"nothing new"* line wants.
> 4. **The batch-record type comes from `lib/admin/schema.ts`, as a type-only import.** The draft
>    offered two homes (a structural twin in `filetree.ts`, or a type export from the `'use server'`
>    module) and asked the reconciler to pick. Neither: `import type { AvatarBatchRecord } from
>    '@/lib/admin/schema'` is the answer. A type-only import erases completely, so no `zod` reaches
>    the bundle — the hazard the draft was avoiding is avoided — and the type is `z.infer` of the
>    schema the server validates against, so the client cannot assemble a record the boundary would
>    reject. A structural twin would have been a third shape to keep in step with a Zod schema, and
>    the `AvatarLike` idiom exists so a pure module need not import from `lib/db`, not so a client
>    can avoid importing a validated shape.

**Unchanged actions this phase calls** (already in `lib/admin/ninaAlbumActions.ts` today; phase 4
changes their internals, not their signatures):

- `setCurrentNinaAvatarAction(rawId: string): Promise<AdminActionResult>` — `:135`
- `saveNinaAvatarCropAction(input: unknown): Promise<AdminActionResult>` — `:155`
- `deleteNinaAvatarAction(rawId: string): Promise<AdminActionResult>` — `:185`
- `describeNinaAvatarAction(rawId: string): Promise<AdminActionResult>` — `:57`

**Retiring `registerNinaAvatarAction` (singular).** Deleting `UploadAvatar.tsx` removes its only
caller, and phase 4 kept it alive deliberately rather than leave a dangling export. **This phase
deletes it in the same commit as the component** — phase 4's handoff asks for exactly that
(*"If phase 5 removes the component, remove the singular action in the same commit"*). See Step 11.

**Unchanged from today, imported as-is:** `adminAvatarPathname`, `extForContentType`,
`ADMIN_AVATAR_MIN_EDGE_PX`, `ADMIN_AVATAR_MAX_UPLOAD_BYTES` (`lib/admin/avatars.ts:61,66,46,43`);
`resolveCrop`, `isIdentityCrop`, `NinaCrop`, `NinaCropInput` (`lib/nina/crop.ts`); `newId`
(`lib/id.ts:19`); `longEdgeTargetFor` (`lib/photos/resizeTarget.ts:41`); `upload` from
`@vercel/blob/client`; `Button`, `ButtonLink`, `EmptyState` from `@/components/ui`; `CropStudio`,
`CircleFrame`; `NINA_AVATAR_FALLBACK_SRC` (`lib/nina/album.ts:31`).

**From phase 4 — `app/api/admin/nina/upload/route.ts`:** the route accepts
`nina/<userId>/thumb-<id>.<ext>` in `onBeforeGenerateToken`'s pathname check with
`ADMIN_AVATAR_THUMB_MAX_UPLOAD_BYTES` (512 KB) instead of 8 MB, **and it cross-checks that the
pathname's extension matches the `contentType` in `clientPayload`.** So this phase sends the
thumbnail as `adminAvatarThumbPathname(userId, id, 'jpg')` with
`clientPayload: JSON.stringify({ contentType: 'image/jpeg' })`. `ClientPayload` (`route.ts:56-58`)
needs no change and this phase adds no field to it.

### Leaves alone (owned by others)

- `lib/nina/queries.ts`, `lib/db/schema.ts`, `lib/nina/album.ts`, `lib/admin/avatars.ts`,
  `drizzle/**` — Phase 1
- `lib/admin/filetree.ts`, `tests/admin.filetree.test.ts` — Phase 2
- `lib/nina/attach.ts`, `app/nina/**`, `components/nina/**` — Phase 3
- `lib/admin/schema.ts`, `app/api/admin/nina/upload/route.ts` — Phase 4
- `lib/admin/ninaAlbumActions.ts` — Phase 4 and Phase 6, **with one carve-out**: this phase deletes
  `registerNinaAvatarAction` (singular) from it, because deleting `UploadAvatar.tsx` removes its
  last caller and phase 4 asked for the two to land in the same commit. Nothing else in that file
  is read, reordered or edited; in particular `avatarRegisterSchema` stays (its tests cover it) and
  phase 4's appended block is not touched
- `components/admin/CircleFrame.tsx` — **reused verbatim, not edited.**
- `components/admin/CropStudio.tsx` — **reused verbatim in behaviour**; one docstring line changes
  (see the Files table), because this phase deletes the file that line names. `CropStudio` already
  measures its own frame with a `ResizeObserver` (`CropStudio.tsx:70-78`), which is the whole
  reason it can move from a 460 px column into a 320 px rail without a line of code changing.
- `components/admin/AdminNav.tsx`, `app/admin/layout.tsx` — untouched. No new nav item, no change
  to the 224 px track or the `max-w-[1400px]` shell.
- `lib/format.ts` — untouched. See Handoffs for the byte formatter this phase deliberately does not
  add.
- Folder create / rename / move / delete — Phase 6. Seams named in Handoffs.
- "Share link to Nina" — Phase 7. Seam named in Handoffs.

---

## Files

| File | Action | What changes |
|---|---|---|
| `app/admin/nina/page.tsx` | modify | whole body. `PageProps<'/admin/nina'>` + `?folder=`/`?page=`; two folder-aware reads replace `listNinaAvatars` (`:24`); the row -> prop map (`:29-40`) gains `thumbUrl`/`folder`/`filename`; renders `FileExplorer` instead of `AlbumManager` (`:60`) |
| `components/admin/explorer/model.ts` | create | the client view models and the queue's state machine types |
| `components/admin/explorer/thumbnail.ts` | create | `createImageBitmap` + `OffscreenCanvas` -> a 256 px JPEG blob, and the one decode that also reports `width`/`height` |
| `components/admin/explorer/dropWalk.ts` | create | `webkitGetAsEntry` captured synchronously, and the recursive `readEntries` walk **that loops until the batch is empty** |
| `components/admin/explorer/useFolderUpload.ts` | create | manifest read -> `planFolderUpload` -> bounded-concurrency PUTs -> chunked batch register |
| `components/admin/explorer/FolderTree.tsx` | create | the tree pane: `<Link>` rows, counts in a `tabular-nums` column, chevrons |
| `components/admin/explorer/PhotoGrid.tsx` | create | the thumbnail grid, the selection state, the Newer/Older pager, the empty state |
| `components/admin/explorer/SelectionPane.tsx` | create | the framing studio lifted from `AlbumManager.tsx:84-192` unchanged, plus the photo's actions |
| `components/admin/explorer/UploadQueue.tsx` | create | the sticky progress bar, the counts line, the per-file disclosure |
| `components/admin/FileExplorer.tsx` | create | the screen: toolbar, breadcrumb, three-column shell, drop target, the two file inputs (one with `webkitdirectory` set imperatively) |
| `components/admin/CropStudio.tsx` | modify | **one docstring line** (`:29`): *"the crop lives in `AlbumManager`"* now names `SelectionPane`. Nothing else in the file changes — see Step 11 |
| `lib/admin/ninaAlbumActions.ts` | modify | **one deletion**: `registerNinaAvatarAction` (singular, `:87-129`) goes with its last caller. Phase 4's and phase 6's work in this file is untouched — see Step 11 |
| `components/admin/AlbumManager.tsx` | delete | superseded; its framing pane moved to `SelectionPane.tsx` |
| `components/admin/UploadAvatar.tsx` | delete | superseded; two upload paths is the thing the phase scope forbids. Deleting it also retires phase 4's `registerNinaAvatarAction` (singular), **in the same commit** |

---

## The design, before the code

The visual direction is **not** free here and is not treated as free: `app/admin/layout.tsx:23-27`
says every token is reused and *"the layout is new; the palette is not, which is what stops these
pages from reading like a different product."* So the palette, the radii, `Button`, and `EmptyState`
arrive unmodified. What this phase decides is **structure and density**, which is where a file
manager is either right or unusable.

**The shell.** `<main className="min-w-0">` inside `max-w-[1400px]` with a 224 px nav track and
`lg:gap-8 lg:p-8` leaves about 1080 px. Spent as:

```
┌ /admin ─────────────────────────────────────────────────────────────────────────────────┐
│ 224px nav │ Nina's album                                                               │
│           │ Folders are metadata, not blob paths — moving a photo moves no bytes.      │
│           │                                                                            │
│           │ Album / 2026 / bali          314 photos   [Add photos] [Add a folder] [◧]  │
│           │ ┌─ 200px ────┬─ minmax(0,1fr) ─────────────────┬─ 320px ─────────────────┐ │
│           │ │ FOLDERS    │ ▨ ▨ ▨ ▨ ▨                       │ DSC_0031.jpg            │ │
│           │ │ ▾ Album 314│ ▨ ▨ ▨ ▨ ▨                       │ 2026 / bali             │ │
│           │ │  ▾ 2026 210│ ▨ ▨ ▨ ▨ ▨                       │ ┌───────────────────┐   │ │
│           │ │    bali  88│ ▨ ▨ ▨ ▨ ▨                       │ │  CropStudio       │   │ │
│           │ │    jkt  122│ ▨ ▨ ▨ ▨ ▨                       │ │  (280px square)   │   │ │
│           │ │  ▸ 2025 104│ ▨ ▨ ▨ ▨ ▨                       │ └───────────────────┘   │ │
│           │ │            │                                 │ [Save framing] [Reset]  │ │
│           │ │            │ ◂ Newer  121–240 of 314  Older ▸│ ◯44 ◯28                 │ │
│           │ │            ├─────────────────────────────────┤ ── ── ── ── ── ── ── ── │ │
│           │ │            │ ▓▓▓▓▓▓▓▓▓▓░░░░░░ 42 of 313 · 8  │ Set as her profile pic  │ │
│           │ │            │ already here · 1 failed    [▾]  │ Describe it · Remove    │ │
│           │ └────────────┴─────────────────────────────────┴─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

Four decisions worth defending, because each rejects the obvious answer:

1. **The signature element is the number column.** This screen's entire job is counting and
   comparing sets of files — how many are under this folder, how many of the 313 dropped were new,
   how many were already there. So every number on the screen is `tabular-nums`, right-aligned, and
   set in the same 11–12 px semibold utility treatment: the tree's per-folder counts, the pager's
   `121–240 of 314`, the queue's `42 of 313 · 8 already here`. Numbers get a column and a voice
   instead of being sprinkled into prose. That is the device that encodes something true about the
   content, rather than decorating it.

2. **The drop target is the content pane, not a dashed box.** A dashed "drop your files here" box is
   the templated answer and it spends the one region that should hold photographs. Instead the whole
   middle column takes `ring-2 ring-accent ring-inset` and a `bg-accent-soft` wash while a drag is
   over it, with one line of copy that names the destination — **"Drop into Album / 2026 / bali"**.
   That is honest (the destination genuinely is the folder on screen), it costs no layout, and
   `EmptyState`'s dashed vocabulary stays reserved for what its own docstring says it means: *"a
   different kind of thing, never something went wrong."*

3. **The grid shows the file, not the framed avatar.** `AlbumManager` drew `size-24` circles through
   `CircleFrame`. A file manager's tile answers *"which file is this"*; the circle answers *"how does
   her face sit in the frame"*. So the grid is square `object-cover` thumbnails with the filename
   under them, and `CircleFrame` moves to the selection pane where framing actually happens — where
   it is still the same component, drawing at the same 44 px and 28 px sanity sizes it draws today.
   As a bonus the square tile is exactly the shape a 256 px thumbnail is for.

4. **The details rail is toggleable and opens on selection.** A 320 px rail sitting 90% empty while
   you browse 300 photographs is wasted, and reflowing the grid on every click is worse. So it opens
   on the first selection and stays open until the operator closes it — which is what Explorer's own
   details pane does, and the grid goes from 5 columns to 8 when it is shut. Selection lives in
   `useState` and **not** in the URL, deliberately: clicking a photograph must not re-run a Server
   Component that just did two database reads.

**Copy register.** Active voice, sentence case, the same verb through the whole flow. The button
says **Set as her profile picture** and the pane then says **Her profile picture**. Empty states are
invitations, not moods: *"Nothing in this folder yet. Drop a folder from Explorer, or add photos."*
A drop that uploads nothing says so in numbers — *"Nothing new. All 313 files are already here."* —
because a silent no-op reads as a broken page, and that sentence is the whole of R1's
*"automatically upload only the new folders and files"* made visible.

**What is not here.** No animation beyond the `transition-[opacity,transform]` that `Button` already
carries and the progress bar's width transition. No icon set — a chevron drawn as a rotated CSS
triangle and a folder glyph drawn as text is enough, and adding an icon dependency to buy 12 glyphs
would be the accessory to remove before leaving the house. `Card` is deliberately not used: its
docstring calls it *"the app's one surface — white fill, 22 px radius, soft shadow, no border"*, and
a file manager's panes want hairline rules that divide, not floating slabs that separate. The
explorer's panes therefore use the `rounded-card border border-rule bg-card` vocabulary
`AlbumManager.tsx:204` and `app/admin/nina/page.tsx:53` already established on this screen.

---

## Implementation Steps

### Step 1: The view models

**File:** `components/admin/explorer/model.ts` (new)
**Change:** The types every explorer component shares. A separate module rather than exports on
`FileExplorer.tsx` (which is how `AlbumPhoto` lived on `AlbumManager.tsx:34`) because five children
need them and a child importing a type from its own parent is a cycle a reader has to think about.
Types only, so the module erases and is safe in either graph.

**Code:**

```ts
import type { UploadRefusal } from '@/lib/admin/filetree'
import type { NinaCropInput } from '@/lib/nina/crop'

/**
 * What `/admin/nina`'s explorer knows about the album, and nothing more.
 *
 * The successor to `AlbumManager`'s `AlbumPhoto`, and narrower than `NinaAvatarRow` for the reason
 * `app/admin/nina/page.tsx` has always given: `announcedAt` and `pathname` are of no use to a
 * browser, so they never cross the serialization boundary. Three fields are new — `thumbUrl`,
 * `folder` and `filename` — and each is the whole point of one part of this phase.
 *
 * Types only. Nothing here is a runtime export, so the module compiles into whichever graph imports
 * it and the Server Component that builds these objects does not drag a client module in with it.
 */

export interface ExplorerPhoto {
  id: string
  /**
   * The ORIGINAL blob. Deliberately not what the grid renders.
   * `components/admin/UploadAvatar.tsx:26-33` is why it exists un-re-encoded ("a 4x zoom on a
   * 768 px source would show her face at 192 px of real detail"), and this is the URL the framing
   * studio, the sanity circles and phase 13's full-screen viewer all read.
   */
  url: string
  /**
   * The 256 px derived JPEG, or `null`.
   *
   * **`null` is not an edge case, it is the migration path.** Every row that existed before phase 1
   * added the column has no thumbnail, and a browser without `OffscreenCanvas` uploads none. Every
   * consumer therefore falls back to `url`, and the grid is correct-but-heavy rather than broken.
   */
  thumbUrl: string | null
  /** `''` is the album root. `'2026/bali'` is two levels down. Never a blob prefix — a column. */
  folder: string
  /** The name the file had on his laptop, or a fallback built from the id for a pre-phase-1 row. */
  filename: string
  width: number | null
  height: number | null
  bytes: number | null
  source: string
  isCurrent: boolean
  /** Read by nothing in `components/` — invariant 5. Shown as present/absent, never rendered. */
  description: string | null
  crop: NinaCropInput
  createdAt: string
}

/** One folder that holds at least one row. `buildTree` (phase 2) nests a list of these. */
export interface ExplorerFolder {
  folder: string
  count: number
}

/**
 * Where in the folder we are. Offsets rather than a keyset cursor, because a file manager's pager
 * says "121–240 of 314" and offers Newer as well as Older — see this phase's Requires block, which
 * is also where the one cost of that choice is written down (a tile can repeat across two
 * consecutive pages *during* an upload; nothing is ever skipped).
 */
export interface ExplorerPageInfo {
  folder: string
  /** 1-based, clamped by the page before it ever reaches a query. */
  page: number
  pageSize: number
  /** Rows in THIS folder, not in its subtree. The grid is not recursive; the tree is. */
  total: number
}

/**
 * One file's progress through the queue.
 *
 * The shape is `components/nina/Composer.tsx:104`'s `TileState` at a different scale, and the
 * difference is instructive: a chat tile ends in `describing` because `glm-4.6v` runs on the upload
 * path there. Here it does not — phase 4 took the describe pre-pass off this path precisely because
 * *"i will put hundreds of profile pics in there"* means hundreds of ~8–11 s vendor round trips —
 * so the terminal state before `done` is `registering`.
 */
export type QueueItemState =
  | 'waiting'
  | 'thumbnailing'
  | 'uploading'
  | 'registering'
  | 'done'
  | 'error'

export interface QueueItem {
  /**
   * Phase 2's dedupe key for this file, which is unique inside one gesture by construction (it
   * folds in the path). Used as the React key and as the patch address, so no second id is minted.
   */
  id: string
  /** The path as it will exist in the album: `2026/bali/DSC_0031.jpg`. */
  path: string
  folder: string
  filename: string
  state: QueueItemState
  error: string | null
}

/**
 * What the gesture decided BEFORE any byte moved — the visible half of *"it automatically upload
 * only the new folders and files as optimization"*.
 *
 * `already` is the number this whole report exists for. A drop of a folder that is fully uploaded
 * enqueues nothing, and without this number on screen that is indistinguishable from a broken page.
 */
export interface QueueReport {
  /**
   * Local files that will not be uploaded because a row with their key exists — already in the
   * album, or repeated inside this same gesture. `plan.counts.existing`.
   */
  already: number
  /** Not an image. Skipped silently per the requirement — but counted here, never hidden. */
  rejected: number
  /**
   * An image we would not take: over the byte cap, zero bytes, unnamed, name too long, or a
   * destination that breaks the path grammar. `name` is the file's own display name, which is what
   * `plan.refused` carries — phase 2 deliberately does not hand back a joined path here, because
   * the whole reason some of these are refused is that the path could not be formed.
   */
  refused: ReadonlyArray<{ name: string; reason: UploadRefusal }>
  /** How many files the walk found in total, before any of the above was decided. */
  found: number
}
```

**Impact:** No behaviour. Creates the vocabulary every later step spells.

---

### Step 2: The thumbnail, derived client-side

**File:** `components/admin/explorer/thumbnail.ts` (new)
**Change:** One decode per file that yields both the intrinsic dimensions (which the crop clamp
needs and no server has, per `UploadAvatar.tsx:32-36`) and a 256 px JPEG blob to upload beside the
original.

**Code:**

```ts
import { longEdgeTargetFor } from '@/lib/photos/resizeTarget'

/**
 * The derived thumbnail — the answer to "hundreds of profile pics" in a grid that may not use
 * `next/image`.
 *
 * ── WHY A SECOND BLOB AND NOT A TRANSFORM ───────────────────────────────────────────────────
 * `components/nina/NinaPhotoGrid.tsx:56-58` rules out `next/image` on Blob-hosted photos outright:
 * it *"would re-optimise finished files on a paid transform quota"*. So a grid of three hundred
 * originals is three hundred multi-megabyte downloads, and there is no server-side resizer in the
 * loop to ask. The only remaining place with the pixels in hand is the browser that is already
 * decoding the file to measure it — so it draws a 256 px copy while it is there, and that copy is
 * PUT beside the original as a second object.
 *
 * ── THE ORIGINAL IS STILL NOT RE-ENCODED ────────────────────────────────────────────────────
 * `components/admin/UploadAvatar.tsx:26-33`, quoted because it is a ruling and not a preference:
 * *"An avatar is neither: the crop is a display transform, so a 4x zoom on a 768 px source would
 * show her face at 192 px of real detail, and phase 13's full-screen viewer serves the same blob.
 * The original goes up whole."* That still holds. This module ADDS a thumbnail; it does not touch
 * what goes into `avatar-<id>.<ext>`.
 *
 * ── ONE DECODE, AND `close()` IS NOT OPTIONAL ───────────────────────────────────────────────
 * `createImageBitmap(file, { resizeWidth, … })` would decode straight to the thumbnail size, but
 * then the intrinsic `width`/`height` — which `clampCrop` needs and `avatarRegisterSchema` bounds —
 * would be lost. So the decode is full-size and the scaling happens on the canvas. That makes
 * `bitmap.close()` load-bearing rather than tidy: an 8 MB 4032x3024 JPEG is ~48 MB of decoded
 * surface, and a three-hundred-file folder that forgets to release them will be killed by the tab's
 * memory ceiling long before it finishes. Hence the `finally`.
 *
 * ── THE TWO NUMBERS BELOW ARE THE CLIENT'S OWN ──────────────────────────────────────────────
 * Nothing on the server re-encodes anything, so no other module has to agree with the short edge or
 * the quality. Only three things cross the boundary and they are all phase 1's and phase 4's:
 * `adminAvatarThumbPathname`, the content type, and `ADMIN_AVATAR_THUMB_MAX_UPLOAD_BYTES` (which
 * Blob enforces at PUT time, not this file). That is why these live here and not in
 * `lib/admin/avatars.ts` — a constant is shared when it is *agreed on*, and these are not.
 *
 * The reconciler agreed and deleted phase 1's draft `ADMIN_AVATAR_THUMB_EDGE_PX = 384`: it had
 * different semantics (long edge, not short), a different value, and no reader on the server. Two
 * constants naming one thing with two numbers is the failure this repo's "one home" rule exists to
 * prevent, and the home is here.
 */

/**
 * 256 px on the SHORT edge. The grid draws at ~96 px, which is `size-24` — exactly what
 * `AlbumManager.tsx:218` drew — so 256 covers a 2x display with room to spare, and it is the same
 * number as `ADMIN_AVATAR_MIN_EDGE_PX`: a file we accept at all is never upscaled by this.
 */
export const EXPLORER_THUMB_SHORT_EDGE_PX = 256

/** 0.82 — visually clean at 96 px and lands a 256 px face around 15–25 KB. */
export const EXPLORER_THUMB_QUALITY = 0.82

/**
 * JPEG, always, whatever the original was. It is a display derivative, so transparency is
 * meaningless and the container that decodes fastest wins. It is also already in
 * `ADMIN_AVATAR_CONTENT_TYPES`, so the upload route's `allowedContentTypes` needs no new member.
 */
export const EXPLORER_THUMB_CONTENT_TYPE = 'image/jpeg'

export interface MeasuredFile {
  width: number
  height: number
  /** The derived JPEG, or `null` when this browser could not make one. Never fatal. */
  thumb: Blob | null
}

/**
 * Decode once; report the intrinsic size; return a 256 px JPEG if the browser can make one.
 *
 * Throws only if the file does not decode as an image at all — which is the caller's cue to mark
 * that one file failed, not to abandon the batch.
 */
export async function measureAndThumbnail(file: File): Promise<MeasuredFile> {
  const bitmap = await createImageBitmap(file)
  try {
    const width = bitmap.width
    const height = bitmap.height
    return { width, height, thumb: await drawThumbnail(bitmap, width, height) }
  } finally {
    // See the header: not tidiness, a memory ceiling.
    bitmap.close()
  }
}

/**
 * `null` on every failure, and every failure is silent by design: a missing thumbnail costs the
 * grid one heavy download, and `ExplorerPhoto.thumbUrl` is nullable precisely so that this can
 * degrade instead of refusing an upload.
 */
async function drawThumbnail(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas === 'undefined') return null
  try {
    const longEdge = longEdgeTargetFor(width, height, EXPLORER_THUMB_SHORT_EDGE_PX)
    const scale = longEdge / Math.max(width, height)
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))

    const canvas = new OffscreenCanvas(targetWidth, targetHeight)
    const context = canvas.getContext('2d')
    if (context == null) return null

    // A PNG with an alpha channel flattens to BLACK behind a JPEG encoder unless the ground is
    // painted first, which on a portrait means a black halo around her hair. White, not `--card`:
    // this is baked pixel data and it must not carry a theme.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, targetWidth, targetHeight)
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight)

    return await canvas.convertToBlob({
      type: EXPLORER_THUMB_CONTENT_TYPE,
      quality: EXPLORER_THUMB_QUALITY,
    })
  } catch (cause) {
    console.warn('[f33] thumbnail derivation failed; the grid will load the original', cause)
    return null
  }
}
```

**Impact:** `longEdgeTargetFor` gains a second caller. Nothing else changes. `lib/photos/resizeTarget.ts`
is untouched — it is pure, unit-tested, and already computes exactly this (*"the value to pass so
that the resulting image's SHORT edge is `shortEdgeTarget`"*, and it never upscales).

---

### Step 3: The directory walk — the picker's files and the drop's entries

**File:** `components/admin/explorer/dropWalk.ts` (new)
**Change:** The two browser-only halves of *"drag and drop folders from my local win explorer"*.
Everything decidable purely is phase 2's; this file is only what a pure module cannot have.

**Code:**

```ts
import type { LocalFileLike } from '@/lib/admin/filetree'

/**
 * The two browser APIs that turn a gesture into a list of files with paths. Nothing here is
 * testable and nothing here decides anything.

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
```

**Impact:** No existing behaviour. `WalkedFile` is structurally `LocalFileLike & { file: File }`, so
it is the diff's input with nothing mapped. `DataTransferItem.webkitGetAsEntry`, `FileSystemDirectoryEntry`,
`FileSystemDirectoryReader`, `FileSystemFileEntry` and `File.webkitRelativePath` are all declared in
TypeScript's `lib.dom.d.ts` (verified in `node_modules/typescript/lib/lib.dom.d.ts` at lines 9541,
11783, 11853, 11921 and 11626), so **no ambient declaration file is needed and `types/` is not
touched.** The two `as` casts on `entry` are the standard narrowing for this API: `FileSystemEntry`
carries `isFile`/`isDirectory` booleans rather than being a discriminated union, so there is nothing
for `if` to narrow.

---

### Step 4: The queue — manifest, diff, bounded uploads, chunked register

**File:** `components/admin/explorer/useFolderUpload.ts` (new)
**Change:** The whole upload path in one hook: read the manifest, plan purely, set state once, then
run a fixed number of lanes.

**Code:**

```ts
'use client'

import { upload } from '@vercel/blob/client'
import { useCallback, useRef, useState } from 'react'

import {
  adminAvatarPathname,
  adminAvatarThumbPathname,
  ADMIN_AVATAR_MAX_UPLOAD_BYTES,
  ADMIN_AVATAR_MIN_EDGE_PX,
  extForContentType,
} from '@/lib/admin/avatars'
import { planFolderUpload, type PlannedUpload } from '@/lib/admin/filetree'
import {
  listNinaAlbumManifestAction,
  registerNinaAvatarsAction,
} from '@/lib/admin/ninaAlbumActions'
import type { AvatarBatchRecord } from '@/lib/admin/schema'
import { newId } from '@/lib/id'
import { NINA_ADMIN_BATCH_MAX } from '@/lib/nina/album'

import type { QueueItem, QueueReport } from './model'
import { walkEntries, type WalkedFile } from './dropWalk'
import { EXPLORER_THUMB_CONTENT_TYPE, measureAndThumbnail } from './thumbnail'

/**
 * One gesture, from "he let go of the mouse" to "the rows exist".
 *
 * ── THE SHAPE IS F17'S, AND THAT IS NOT A STYLE CHOICE ──────────────────────────────────────
 * `docs/plans/F17-onpick-purity.md` measured what happens when a decision is made inside a
 * `setState` updater: `reactStrictMode: true` double-invokes updaters in dev, so one picked file
 * minted **two** upload tokens and wrote **two** blobs, one of them orphaned in the store forever.
 * Nothing in `run()` below is inside an updater. It gathers, it awaits the manifest, it calls one
 * pure function, it calls `setItems`/`setReport` with values, and only then does it start any
 * effect — decide, set, run. `components/nina/Composer.tsx:256-287` is the same three steps at
 * three files instead of three hundred.
 *
 * ── BOUNDED CONCURRENCY, NOT `Promise.all` ──────────────────────────────────────────────────
 * `Promise.all` over three hundred files would open three hundred token-mint requests to
 * `/api/admin/nina/upload` and three hundred simultaneous PUTs, decode three hundred images at once,
 * and report progress as one long pause followed by everything. Four lanes is enough to saturate a
 * home upstream link, keeps at most four decoded bitmaps alive, and makes the progress line mean
 * something.
 *
 * ── PER-FILE FAILURE IS NOT BATCH FAILURE ───────────────────────────────────────────────────
 * A file that will not decode, or a PUT that 500s, marks THAT item `error` and the lane moves on.
 * Three hundred files with one bad frame must not lose two hundred and ninety-nine uploads.
 *
 * ── REGISTERING IN CHUNKS, AS THEY LAND ─────────────────────────────────────────────────────
 * Records are flushed to `registerNinaAvatarsAction` every `NINA_ADMIN_BATCH_MAX` completions
 * rather than once at the end, for one reason: a tab closed at file 290 of 300 should leave 250
 * registered rows, not 300 orphaned blobs. Phase 4's action is idempotent on the dedupe key's
 * unique index, so a re-drop after a crash re-registers nothing and re-uploads only what is missing
 * — which is the same mechanism as *"upload only the new folders and files"*, applied to our own
 * failure.
 *
 * ── THE ORPHAN EXPOSURE, NAMED ──────────────────────────────────────────────────────────────
 * An upload that dies between the PUT and its register chunk leaves an object in Blob that no row
 * points at. That is the album's existing exposure (ruling D4's open card for
 * `scripts/blob-reap.mjs`, which still does not know the `nina/` prefix) and a batch upload widens
 * it. It is why `dismiss()` refuses to run while the queue is busy: throwing away the records of
 * in-flight PUTs would manufacture orphans on purpose.
 */

/** Four parallel PUTs. See the header. */
export const EXPLORER_UPLOAD_CONCURRENCY = 4

/**
 * How many records go into one `registerNinaAvatarsAction` call.
 *
 * **`NINA_ADMIN_BATCH_MAX` and nothing else** — phase 1's one definition, imported from
 * `lib/nina/album.ts`, which is the module that satisfies the constraint this file actually has:
 * it carries no `zod`, no `server-only` and no database import, so reading a constant from it costs
 * the `/admin/nina` browser bundle nothing. (Reading one from `lib/admin/schema.ts` would have
 * pulled a validator in for the sake of an integer; a module-level `z.object(...)` is a side effect
 * no bundler tree-shakes. That is why the constant is not there.) Phase 4's Zod bounds the array
 * with the same number and `insertNinaAvatars` throws above it, so this is the first of three
 * agreeing checks rather than a second opinion.
 */
const REGISTER_CHUNK = NINA_ADMIN_BATCH_MAX

export type UploadPhase = 'idle' | 'reading' | 'planning' | 'uploading' | 'finished'

export interface FolderUpload {
  phase: UploadPhase
  items: readonly QueueItem[]
  report: QueueReport | null
  /** A gesture that failed before a queue existed — the manifest read, or nothing readable dropped. */
  error: string | null
  /** Files from either `<input>`. */
  start: (walked: readonly WalkedFile[]) => void
  /** Entries captured synchronously from a drop; the walk happens inside. */
  startWalk: (entries: readonly FileSystemEntry[]) => void
  /** Clear the queue. Refused while busy — see the header's orphan note. */
  dismiss: () => void
}

export function useFolderUpload({
  userId,
  destination,
  onFinished,
}: {
  userId: string
  /** The folder the gesture lands in — the folder the explorer is showing. */
  destination: string
  /** Called once per gesture, after the last register chunk. `router.refresh()` lives here. */
  onFinished: () => void
}): FolderUpload {
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [items, setItems] = useState<readonly QueueItem[]>([])
  const [report, setReport] = useState<QueueReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * Which gesture is live. `Composer`'s `dropped` ref (`Composer.tsx:183`) at gesture granularity:
   * a promise from a dismissed or superseded run must not write into the state of the current one.
   */
  const runRef = useRef(0)
  const busyRef = useRef(false)

  const patch = useCallback((run: number, id: string, next: Partial<QueueItem>) => {
    if (run !== runRef.current) return
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...next } : item)))
  }, [])

  /**
   * One file: measure, thumbnail, PUT the original, PUT the thumbnail, hand back the record.
   * Returns `null` when this file failed — the item is already marked and the lane continues.
   *
   * **Declared before `run`, and that is required rather than tidy.** `run` lists it in its
   * dependency array, and a dependency array is evaluated DURING RENDER — so a `const` declared
   * below would still be in its temporal dead zone at that moment and the render would throw.
   */
  const uploadOne = useCallback(
    async (
      gesture: number,
      planned: PlannedUpload<WalkedFile>,
    ): Promise<AvatarBatchRecord | null> => {
      const file = planned.source.file
      const fail = (message: string): null => {
        patch(gesture, planned.sourceKey, { state: 'error', error: message })
        return null
      }

      /*
       * `planned.contentType` and `planned.ext` come off the plan and are guaranteed to agree with
       * each other (phase 2's `classifyFile` derives the extension from the CONTENT TYPE, never
       * from the filename, so a blob called `.png` cannot hold a JPEG). Nothing is re-classified
       * here — the draft called `uploadableContentType` a second time, which was a second answer to
       * a question the plan had already answered.
       *
       * `extForContentType` is still called, on the content type rather than on the name, as the
       * one assertion that this phase and `lib/admin/avatars.ts` agree about the mapping: it is
       * typed `AdminAvatarExt`, so this line is where a divergence between phase 2's union and
       * `ADMIN_AVATAR_EXTS` becomes a build error instead of a bad pathname.
       */
      const contentType = planned.contentType
      const ext = extForContentType(contentType)
      if (ext == null) return fail('Not a JPEG, PNG or WebP.')

      patch(gesture, planned.sourceKey, { state: 'thumbnailing' })
      let measured
      try {
        measured = await measureAndThumbnail(file)
      } catch {
        return fail('That file did not decode as an image.')
      }
      if (Math.min(measured.width, measured.height) < ADMIN_AVATAR_MIN_EDGE_PX) {
        // The same refusal `UploadAvatar.tsx:81-86` made, for the same reason: below this the
        // circular frame cannot be zoomed at all without visible mush. It cannot be decided by
        // `planFolderUpload`, which has no pixels — only a decode knows.
        return fail(
          `Too small to frame — the short edge is ${Math.min(measured.width, measured.height)} px.`,
        )
      }

      patch(gesture, planned.sourceKey, { state: 'uploading' })
      const id = newId()
      let original
      try {
        original = await upload(adminAvatarPathname(userId, id, ext), file, {
          access: 'public',
          contentType,
          handleUploadUrl: '/api/admin/nina/upload',
          clientPayload: JSON.stringify({ contentType }),
        })
      } catch (cause) {
        return fail(cause instanceof Error ? cause.message : 'That upload failed.')
      }

      /*
       * The thumbnail is a SECOND blob under the SAME id: `avatar-<id>.<ext>` and
       * `thumb-<id>.jpg`. A failure here is not a failure of the upload — `thumbUrl` is nullable
       * and the grid falls back to the original, which is exactly what every pre-phase-1 row does.
       */
      let thumbUrl: string | null = null
      let thumbPathname: string | null = null
      if (measured.thumb != null) {
        try {
          /*
           * `'jpg'` is the THIRD argument and is required: the Route Handler cross-checks the
           * pathname's extension against the `contentType` declared below, and a mismatch is a
           * 400. `EXPLORER_THUMB_CONTENT_TYPE` is `image/jpeg`, so the extension is `jpg`.
           */
          const thumb = await upload(adminAvatarThumbPathname(userId, id, 'jpg'), measured.thumb, {
            access: 'public',
            contentType: EXPLORER_THUMB_CONTENT_TYPE,
            handleUploadUrl: '/api/admin/nina/upload',
            clientPayload: JSON.stringify({ contentType: EXPLORER_THUMB_CONTENT_TYPE }),
          })
          thumbUrl = thumb.url
          thumbPathname = thumb.pathname
        } catch (cause) {
          console.warn('[f33] thumbnail upload failed; the grid will load the original', cause)
        }
      }

      /*
       * `thumb` is ONE nullable object and not two nullable fields, which is phase 4's schema
       * shape and is better than the draft's flat pair: "has a thumbnail" becomes one question
       * instead of two fields that can disagree about it.
       */
      return {
        blobUrl: original.url,
        pathname: original.pathname,
        contentType,
        width: measured.width,
        height: measured.height,
        bytes: file.size,
        folder: planned.folder,
        filename: planned.filename,
        sourceKey: planned.sourceKey,
        thumb: thumbUrl == null || thumbPathname == null ? null : { url: thumbUrl, pathname: thumbPathname },
      }
    },
    [patch, userId],
  )

  const run = useCallback(
    async (gather: () => Promise<readonly WalkedFile[]>) => {
      if (busyRef.current) return
      busyRef.current = true
      const gesture = ++runRef.current

      setError(null)
      setItems([])
      setReport(null)
      setPhase('reading')

      try {
        const walked = await gather()
        if (gesture !== runRef.current) return
        if (walked.length === 0) {
          setPhase('finished')
          setError('Nothing readable in that drop. Try the folder picker instead.')
          return
        }

        setPhase('planning')

        /*
         * The manifest is read for the DESTINATION SUBTREE, not for the whole album. Dropping
         * `bali/` into `2026/` compares against what is already under `2026/`, which is the only
         * comparison that can be right: the dedupe key folds in the path, so the same file dropped
         * into two different folders is two different files — and it should be, because a photo's
         * location in the tree is information the operator put there on purpose.
         */
        const manifest = await listNinaAlbumManifestAction({ folder: destination })
        if (gesture !== runRef.current) return
        if (!manifest.ok || manifest.entries == null) {
          setPhase('finished')
          setError(manifest.error ?? 'Could not read what is already in this folder.')
          return
        }

        /*
         * Pure from here to `setItems`, and there is no `Map` any more.
         *
         * The draft kept a `sourceKey -> File` map because it prefixed the destination onto each
         * path itself and then had to find the `File` again after the plan partitioned the list.
         * Neither is needed: `planFolderUpload` takes `base` and joins it per file, and
         * `PlannedUpload<T>.source` hands the caller's own object straight back — which is what
         * phase 2 designed it for. So the `File` rides along on the input object and comes out the
         * other side attached to its plan entry. One less structure that can be wrong, and no
         * second computation of the dedupe key on this side of the boundary at all.
         *
         * `walked` is already `{ relativePath, name, type, size, lastModified, file }` — see
         * `dropWalk.ts` — so nothing is mapped here either.
         */
        const plan = planFolderUpload({
          base: destination,
          files: walked,
          /*
           * `AdminManifestEntry` carries `sourceKey: string`, and `ManifestEntryLike` asks for
           * `sourceKey: string | null` — so the array goes straight in. Phase 2 ignores a null or
           * empty key rather than matching it, which is what makes the diff safe against rows that
           * predate the dedupe column.
           */
          manifest: manifest.entries,
          /*
           * The cap has ONE home (`lib/admin/avatars.ts:43`) and phase 2 takes it as a parameter
           * rather than declaring a second 8 MB. This is the call site that keeps that true.
           */
          maxBytes: ADMIN_AVATAR_MAX_UPLOAD_BYTES,
        })

        setReport({
          already: plan.counts.existing,
          rejected: plan.counts.rejected,
          refused: plan.refused.map((entry) => ({ name: entry.name, reason: entry.reason })),
          found: plan.counts.total,
        })
        setItems(
          plan.upload.map((planned) => ({
            id: planned.sourceKey,
            /* The path as it will exist in the album, assembled from the plan's canonical
             * destination and its sanitised filename — not from the raw walked path. */
            path: planned.folder === '' ? planned.filename : `${planned.folder}/${planned.filename}`,
            folder: planned.folder,
            filename: planned.filename,
            state: 'waiting' as const,
            error: null,
          })),
        )

        if (manifest.truncated === true) {
          // Honest and non-fatal: a truncated manifest makes the diff OVER-report, so some files
          // are re-PUT and their inserts are discarded by `ON CONFLICT DO NOTHING`. Slower, never
          // wrong — phase 1 and phase 4 both argue it at the functions that produce it.
          setError('This folder is large enough that some already-uploaded files may upload again.')
        }

        if (plan.upload.length === 0) {
          setPhase('finished')
          return
        }

        setPhase('uploading')
        const pending: AvatarBatchRecord[] = []

        const flush = async (force: boolean): Promise<void> => {
          while (pending.length >= REGISTER_CHUNK || (force && pending.length > 0)) {
            // `splice` is synchronous, so two lanes can never take the same records: whichever
            // reaches this line first has already emptied what it took before the other runs.
            const chunk = pending.splice(0, REGISTER_CHUNK)
            for (const record of chunk) patch(gesture, record.sourceKey, { state: 'registering' })
            /*
             * THE ENVELOPE, not a bare array: `{ records }`. Phase 4 chose an object holding one
             * array so that a later field (a batch id, a "last chunk" flag) is additive rather
             * than a shape change on an action this file already calls.
             *
             * `ok` means every record in the chunk either inserted or was already in the album —
             * the unique index on `(user_id, source_key)` decides, not application code — so
             * marking the whole chunk `done` is correct and `outcome.inserted` does not need to be
             * consulted per tile. `outcome.skipped` is the number the "nothing new" line wants,
             * and it is already covered by `report.already` for the client-side half of the same
             * fact.
             */
            const outcome = await registerNinaAvatarsAction({ records: chunk })
            for (const record of chunk) {
              patch(
                gesture,
                record.sourceKey,
                outcome.ok
                  ? { state: 'done' }
                  : { state: 'error', error: outcome.error ?? 'The server refused this batch.' },
              )
            }
          }
        }

        await runLanes(plan.upload, async (planned) => {
          if (gesture !== runRef.current) return
          // No lookup, no "lost track of that file" branch: `planned.source` IS the walked entry
          // this plan row was built from, and `planned.source.file` is its `File`.
          const record = await uploadOne(gesture, planned)
          if (record == null) return
          pending.push(record)
          await flush(false)
        })

        await flush(true)
        if (gesture !== runRef.current) return
        setPhase('finished')
        onFinished()
      } catch (cause) {
        if (gesture !== runRef.current) return
        setPhase('finished')
        setError(cause instanceof Error ? cause.message : 'That upload did not finish.')
      } finally {
        busyRef.current = false
      }
    },
    [destination, onFinished, patch, uploadOne],
  )

  const start = useCallback(
    (walked: readonly WalkedFile[]) => {
      void run(async () => walked)
    },
    [run],
  )

  const startWalk = useCallback(
    (entries: readonly FileSystemEntry[]) => {
      void run(() => walkEntries(entries))
    },
    [run],
  )

  const dismiss = useCallback(() => {
    if (busyRef.current) return
    runRef.current += 1
    setItems([])
    setReport(null)
    setError(null)
    setPhase('idle')
  }, [])

  return { phase, items, report, error, start, startWalk, dismiss }
}

/**
 * A fixed number of lanes drawing from one shared index.
 *
 * `next++` needs no lock: JavaScript is single-threaded and each lane only advances at an `await`
 * boundary, so the read-and-increment is atomic with respect to every other lane. This is the whole
 * of "bounded concurrency" and it is four lines rather than a dependency.
 */
async function runLanes<T>(
  units: readonly T[],
  worker: (unit: T) => Promise<void>,
): Promise<void> {
  let next = 0
  const lanes = Array.from(
    { length: Math.min(EXPLORER_UPLOAD_CONCURRENCY, units.length) },
    async () => {
      for (;;) {
        const unit = units[next++]
        if (unit == null) return
        await worker(unit)
      }
    },
  )
  await Promise.all(lanes)
}
```

**Note for the implementer — SETTLED by the reconciler.** The batch-record type is
`import type { AvatarBatchRecord } from '@/lib/admin/schema'`. Both homes the draft offered were
rejected: a structural twin in `filetree.ts` would be a third shape to keep in step with a Zod
schema (and the `AvatarLike` idiom exists so a pure module need not import from `lib/db`, not so a
client can avoid importing a validated shape), and a re-export from the `'use server'` module is
legal but points the client at a module that reaches `@vercel/blob` and `lib/db`. A **type-only**
import from `lib/admin/schema.ts` erases completely — no `zod` in the bundle — and the type is
`z.infer` of the schema the server validates against, so a record this file can construct is a
record the boundary accepts.

**Impact:** The single upload path for `/admin`. `UploadAvatar`'s single-file flow is gone, and so
is `registerNinaAvatarAction` (see the Deletes section).

---

### Step 5: The folder tree

**File:** `components/admin/explorer/FolderTree.tsx` (new)
**Change:** The left rail. `<Link>` rows so a folder change is a real navigation and the Server
Component re-reads.

**Code:**

```tsx
'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { buildTree, folderAncestors, type FolderNode } from '@/lib/admin/filetree'
import { cn } from '@/lib/cn'

import type { ExplorerFolder } from './model'

/**
 * The folder rail — *"make the photos much more structured and easier to maintain"*, made
 * navigable.
 *
 * ── EVERY ROW IS A `<Link>`, AND THAT IS THE OPPOSITE OF `usePanelParam` ────────────────────
 * `components/ui/usePanelParam.ts` argues at length for `window.history.pushState` over
 * `router.push`, because `/me`'s open panel is client state and re-running six database reads for it
 * would be waste. **Here the reasoning inverts.** Changing folder changes *which rows exist*: the
 * page must re-run `listNinaAvatarsInFolder` for the new folder and the new offset, and that is a
 * server read by definition. So `<Link>`, real navigation, `?folder=` in the URL — which also makes
 * a folder deep-linkable and the back button meaningful, both of which a file manager owes its user.
 *
 * Selection of a PHOTO is the other case and is held in `useState` for exactly `usePanelParam`'s
 * reason. The two live side by side on this screen on purpose.
 *
 * ── EXPANSION IS A DEFAULT PLUS AN OVERRIDE, NEVER DERIVED STATE ────────────────────────────
 * A node is open when it is on the path to the current folder — computed from props, so navigating
 * reveals the destination with no effect and no state to sync. A chevron writes an override for
 * that one node. `override[path] ?? onPath.has(path)` is the whole rule, which is why there is no
 * `useEffect` here copying props into state and no bug where the tree forgets where you are.
 *
 * ── THE COUNTS ARE THE POINT OF THE COLUMN ──────────────────────────────────────────────────
 * `totalCount`, right-aligned, `tabular-nums`. *"i will put hundreds of profile pics in there"* is
 * the requirement, so "how many are under here" is the question this rail answers on every row at a
 * glance, and a right-aligned monospaced-figure column is the only way a column of them reads as
 * comparable rather than as decoration.
 *
 * The distinction matters and phase 2's names carry it: `ownCount` is what is filed directly in a
 * folder, `totalCount` includes every descendant, and a COLLAPSED folder reading "0" while holding
 * two hundred photos two levels down is the specific thing that makes a tree pane useless. So the
 * column is `totalCount` at every depth, root included.
 */

export function FolderTree({
  folders,
  current,
  hrefFor,
}: {
  folders: readonly ExplorerFolder[]
  /** `''` is the album root. */
  current: string
  /** Built by `FileExplorer` so the URL grammar has one home. */
  hrefFor: (folder: string) => string
}) {
  /*
   * `buildTree` returns ONE root node, not an array — phase 2's shape, reconciled from the draft's
   * `FolderNode[]`. That is the better shape here and it deletes code: the root's label, its
   * subtree total and whether it has anything to expand all come off the node instead of being
   * recomputed in this component (the draft summed `folders` by hand for the root's count, which
   * was a second opinion about a number `totaliseFolderNode` had already worked out).
   *
   * `ExplorerFolder` is `{ folder: string; count: number }`, which is structurally phase 2's
   * `FolderCount` — so it goes straight in with no mapping.
   */
  const root = useMemo(() => buildTree(folders), [folders])
  const onPath = useMemo(() => new Set([...folderAncestors(current), current]), [current])
  const [override, setOverride] = useState<Record<string, boolean>>({})

  return (
    <nav aria-label="Album folders" className="rounded-card border border-rule bg-card p-3">
      <p className="mb-2 px-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
        Folders
      </p>

      <Row
        href={hrefFor('')}
        label={root.name}
        count={root.totalCount}
        depth={0}
        active={current === ''}
        chevron={root.children.length > 0 ? 'open' : 'none'}
        onToggle={undefined}
      />

      <ul className="mt-0.5">
        {root.children.map((node) => (
          <Branch
            key={node.path}
            node={node}
            depth={1}
            current={current}
            onPath={onPath}
            override={override}
            setOverride={setOverride}
            hrefFor={hrefFor}
          />
        ))}
      </ul>

      {/* SEAM — PHASE 6. The folder-maintenance affordances belong here and in `Row` below:
          a "New folder" button under this nav (it needs `current` as its parent), and a
          right-click or kebab on `Row` for rename / move / delete. `Row` is already the single
          place a folder is drawn, so phase 6 adds one control to one component. The move TARGET
          is `FileExplorer`'s `destination`, which is this rail's `current`. */}
    </nav>
  )
}

function Branch({
  node,
  depth,
  current,
  onPath,
  override,
  setOverride,
  hrefFor,
}: {
  node: FolderNode
  depth: number
  current: string
  onPath: ReadonlySet<string>
  override: Record<string, boolean>
  setOverride: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  hrefFor: (folder: string) => string
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
        active={current === node.path}
        chevron={hasChildren ? (open ? 'open' : 'closed') : 'none'}
        onToggle={
          hasChildren
            ? () => setOverride((previous) => ({ ...previous, [node.path]: !open }))
            : undefined
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
              onPath={onPath}
              override={override}
              setOverride={setOverride}
              hrefFor={hrefFor}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/** One folder, one row. The only place a folder is drawn — see the seam note above. */
function Row({
  href,
  label,
  count,
  depth,
  active,
  chevron,
  onToggle,
}: {
  href: string
  label: string
  count: number
  depth: number
  active: boolean
  chevron: 'open' | 'closed' | 'none'
  onToggle?: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-chip pr-2',
        active ? 'bg-accent-soft' : 'hover:bg-paper-2',
      )}
      style={{ paddingLeft: `${depth * 12}px` }}
    >
      {chevron === 'none' ? (
        <span className="w-5 shrink-0" aria-hidden="true" />
      ) : (
        <button
          type="button"
          onClick={onToggle}
          disabled={onToggle == null}
          aria-label={chevron === 'open' ? `Collapse ${label}` : `Expand ${label}`}
          className="flex size-5 shrink-0 items-center justify-center text-ink-3 disabled:opacity-40"
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

      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'min-w-0 flex-1 truncate py-1.5 text-[13px] font-medium',
          active ? 'text-ink' : 'text-ink-2',
        )}
        title={label}
      >
        {label}
      </Link>

      <span className="shrink-0 text-[11px] font-semibold text-ink-3 tabular-nums">{count}</span>
    </div>
  )
}
```

**Impact:** New. The only navigation this phase adds; `AdminNav` is untouched.

---

### Step 6: The grid and the pager

**File:** `components/admin/explorer/PhotoGrid.tsx` (new)
**Change:** The middle column's content: square thumbnails, selection, the Newer/Older pager, and
the folder's empty state.

**Code:**

```tsx
'use client'

import Link from 'next/link'

import { ButtonLink, EmptyState } from '@/components/ui'
import { cn } from '@/lib/cn'

import type { ExplorerPageInfo, ExplorerPhoto } from './model'

/**
 * One folder's page of photographs.
 *
 * ── WHY THE TILE IS A SQUARE AND NOT `CircleFrame` ──────────────────────────────────────────
 * `AlbumManager.tsx:214-220` drew every album entry through `CircleFrame` at `size-24`, because that
 * screen's only question about a photo was *"what does she look like in it"* — its own docstring
 * says so. A file manager asks a different question first: *"which file is this"*. So the tile is a
 * square `object-cover` crop with the filename under it, and `CircleFrame` moves to the selection
 * pane, where framing is what is actually being decided and where it still draws at the 44 px and
 * 28 px the app really uses. Nothing about `CircleFrame` changes; it changes location.
 *
 * ── THE GRID NEVER LOADS AN ORIGINAL ────────────────────────────────────────────────────────
 * `photo.thumbUrl ?? photo.url` is the one expression that makes *"hundreds of profile pics"*
 * survivable, and the fallback half of it is not defensive padding: every row written before phase
 * 1 added the column has no thumbnail, so the album as it exists today renders entirely through the
 * fallback and gets faster one upload at a time. `loading="lazy"` is the other half — 120 tiles a
 * page (`NINA_ADMIN_PAGE_SIZE`), fetched as they approach the viewport, which is what makes the
 * page size a question about bytes rather than about layout.
 *
 * ── A PLAIN `<img>`, FOR THE REASON THIS REPO HAS ALREADY RULED ─────────────────────────────
 * `components/nina/NinaPhotoGrid.tsx:56-58` rejects `next/image` for Blob-hosted photos outright —
 * it would re-optimise finished files on a paid transform quota. `CircleFrame` makes the same call.
 * The derived thumbnail is this repo's answer to image optimisation for these blobs, and it is
 * written at upload time rather than bought per request.
 */

export function PhotoGrid({
  photos,
  page,
  selectedId,
  onSelect,
  hrefForPage,
}: {
  photos: readonly ExplorerPhoto[]
  page: ExplorerPageInfo
  selectedId: string | null
  onSelect: (id: string) => void
  hrefForPage: (page: number) => string
}) {
  const first = (page.page - 1) * page.pageSize + 1
  const last = Math.min(page.page * page.pageSize, page.total)
  const lastPage = Math.max(1, Math.ceil(page.total / page.pageSize))

  if (photos.length === 0) {
    return (
      <EmptyState
        title={page.page > 1 ? 'Nothing on this page' : 'Nothing in this folder yet'}
        description={
          page.page > 1
            ? 'This folder is not that long any more.'
            : 'Drop a folder from Explorer, or add photos with the buttons above.'
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

  return (
    <div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
        {photos.map((photo) => {
          const selected = photo.id === selectedId
          return (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => onSelect(photo.id)}
                aria-pressed={selected}
                title={photo.filename}
                className={cn(
                  'block w-full rounded-chip border p-1 text-left transition-[opacity,transform] active:scale-[0.985]',
                  selected ? 'border-accent bg-accent-soft' : 'border-rule bg-card hover:bg-paper-2',
                )}
              >
                <span className="relative block aspect-square overflow-hidden rounded-[6px] bg-paper-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Blob-hosted and
                      deliberately un-transformed; see the header. */}
                  <img
                    src={photo.thumbUrl ?? photo.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="size-full object-cover"
                  />
                  {photo.isCurrent && (
                    <span className="absolute inset-x-0 bottom-0 bg-accent px-1 py-0.5 text-center text-[9px] font-semibold tracking-[0.04em] text-card uppercase">
                      Hers
                    </span>
                  )}
                </span>
                <span className="mt-1 block truncate text-[10px] font-medium text-ink-3">
                  {photo.filename}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-rule pt-3">
        {page.page > 1 ? (
          <Link
            href={hrefForPage(page.page - 1)}
            className="text-[12px] font-semibold text-accent"
            rel="prev"
          >
            &lsaquo; Newer
          </Link>
        ) : (
          <span className="text-[12px] font-semibold text-ink-3">&lsaquo; Newer</span>
        )}

        <span className="text-[12px] font-semibold text-ink-2 tabular-nums">
          {first}&ndash;{last} of {page.total}
        </span>

        {page.page < lastPage ? (
          <Link
            href={hrefForPage(page.page + 1)}
            className="text-[12px] font-semibold text-accent"
            rel="next"
          >
            Older &rsaquo;
          </Link>
        ) : (
          <span className="text-[12px] font-semibold text-ink-3">Older &rsaquo;</span>
        )}
      </div>
    </div>
  )
}
```

**Impact:** New. `EmptyState` gains a caller in `/admin`; it is imported unmodified.

---

### Step 7: The selection pane — the framing studio, re-hosted

**File:** `components/admin/explorer/SelectionPane.tsx` (new)
**Change:** `AlbumManager.tsx:84-192` lifted with its behaviour intact, plus the photo's actions:
**Set as her profile picture** (R1's last clause), Describe it, Remove.

**Code:**

```tsx
'use client'

import { useState, useTransition } from 'react'

import { CircleFrame } from '@/components/admin/CircleFrame'
import { CropStudio } from '@/components/admin/CropStudio'
import { Button } from '@/components/ui'
import {
  deleteNinaAvatarAction,
  describeNinaAvatarAction,
  saveNinaAvatarCropAction,
  setCurrentNinaAvatarAction,
} from '@/lib/admin/ninaAlbumActions'
import { folderBreadcrumbs } from '@/lib/admin/filetree'
import { isIdentityCrop, resolveCrop, type NinaCrop } from '@/lib/nina/crop'

import type { ExplorerPhoto } from './model'

/**
 * The details rail: what this file is, how her face sits in the circle, and what can be done to it.
 *
 * ── THE FRAMING HALF IS `AlbumManager.tsx:84-192`, MOVED, NOT REWRITTEN ─────────────────────
 * Same `draft` / `stored` / `dirty` triple, same `run()` transition helper, same "Save framing" /
 * "Reset framing" pair going through one action, same two sanity circles at 44 px and 28 px with the
 * same sentence under them. F33 landed framing and it is correct; this phase re-hosts it and does
 * not re-litigate it. `CropStudio` and `CircleFrame` are imported unmodified — `CropStudio` measures
 * its own frame with a `ResizeObserver` (`CropStudio.tsx:70-78`), which is exactly why it survives
 * the move from a 460 px column into a 320 px rail without a line changing.
 *
 * ── WHAT IS NEW IS ONE BUTTON ───────────────────────────────────────────────────────────────
 * *"in the file explorer view, we can click a photo and select it as profile picture"* — R1's last
 * clause is the primary action at the top of the action list, and it calls the
 * `setCurrentNinaAvatarAction` that has existed since F33. Phase 4 moved the `glm-4.6v` describe
 * onto this path (non-fatally), which is why the button can take several seconds and says so
 * through `Button`'s `loading` state rather than appearing dead.
 *
 * ── NO OPTIMISTIC COPY OF THE ALBUM ─────────────────────────────────────────────────────────
 * `AlbumManager`'s docstring called this out as *"the one class of bug this screen could plausibly
 * have shipped"*, and it still applies: every action calls `revalidatePath('/admin/nina')`, the page
 * is `force-dynamic`, so the photos arrive from the server on every render and there is nothing here
 * to keep in sync.
 *
 * ── `description` IS NEVER RENDERED ─────────────────────────────────────────────────────────
 * Invariant 5. `AlbumManager.tsx:167-169` printed the prose into the page, which this pane
 * deliberately does not do: the row says *whether* she can talk about this photo, not what a vision
 * model wrote. It is her prompt's private input.
 */

export function SelectionPane({
  photo,
  onClose,
  onRemoved,
}: {
  photo: ExplorerPhoto
  onClose: () => void
  /** Selection has to be dropped by the owner — the row is gone. */
  onRemoved: () => void
}) {
  /** The crop being dragged. `null` means "the stored one", which is what Reset restores to. */
  const [draft, setDraft] = useState<NinaCrop | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const stored = resolveCrop(photo.crop)
  const crop = draft ?? stored
  const dirty =
    draft != null && (draft.scale !== stored.scale || draft.x !== stored.x || draft.y !== stored.y)

  function run(action: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null)
    startTransition(async () => {
      const outcome = await action()
      if (!outcome.ok) {
        setError(outcome.error ?? 'That did not work.')
        return
      }
      onOk?.()
    })
  }

  /* `folderBreadcrumbs` (phase 2's name; the draft assumed `breadcrumbFor`) returns crumbs of
   * `{ path, name, depth, isCurrent }` — so the label is `name`, and the root's own name is
   * `NINA_FOLDER_ROOT_LABEL`, which is why "Album" needs no special case here. */
  const trail = folderBreadcrumbs(photo.folder)
    .map((crumb) => crumb.name)
    .join(' / ')

  return (
    <aside className="rounded-card border border-rule bg-card p-5">
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
          className="shrink-0 px-1 text-[13px] font-semibold text-ink-3"
        >
          &times;
        </button>
      </div>

      <CropStudio
        src={photo.url}
        natural={{ width: photo.width, height: photo.height }}
        crop={crop}
        onChange={setDraft}
        disabled={pending}
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="md"
          disabled={!dirty || pending}
          onClick={() =>
            run(
              () =>
                saveNinaAvatarCropAction({
                  id: photo.id,
                  scale: crop.scale,
                  x: crop.x,
                  y: crop.y,
                }),
              () => setDraft(null),
            )
          }
        >
          {dirty ? 'Save framing' : 'Framing saved'}
        </Button>
        <Button
          size="md"
          variant="secondary"
          disabled={pending || (isIdentityCrop(crop) && !dirty)}
          onClick={() =>
            run(
              () => saveNinaAvatarCropAction({ id: photo.id, scale: 1, x: 0, y: 0 }),
              () => setDraft(null),
            )
          }
        >
          Reset framing
        </Button>
      </div>

      {/* The honesty check, unchanged from `AlbumManager.tsx:134-152`. Same helper, same square
          box, the sizes the app actually draws — so "it looked right in the tool" and "it looks
          right in chat" cannot diverge. */}
      <div className="mt-5 flex items-center gap-3">
        <CircleFrame
          src={photo.url}
          natural={{ width: photo.width, height: photo.height }}
          crop={dirty ? crop : photo.crop}
          sizeClass="size-11"
        />
        <CircleFrame
          src={photo.url}
          natural={{ width: photo.width, height: photo.height }}
          crop={dirty ? crop : photo.crop}
          sizeClass="size-7"
        />
        <p className="text-[11px] font-medium text-ink-3">
          44 px and 28 px — the chat header and the typing row, at the sizes they render.
        </p>
      </div>

      <dl className="mt-5 space-y-1 border-t border-rule pt-4 text-[12px] font-medium text-ink-3">
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
          <dd className="text-ink-2">
            {photo.thumbUrl == null ? 'None — the grid loads the original' : 'Derived'}
          </dd>
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

      {/*
        THE ACTION LIST. One vertical stack, primary first.

        SEAM — PHASE 7. "Share link to Nina" is one more entry in this list, directly under
        "Set as her profile picture". It needs `shareOrigin()` as a prop, because
        `lib/share/origin.ts:1` is `server-only` and invariant 9 forbids a `NEXT_PUBLIC_` for it:
        thread it `app/admin/nina/page.tsx` -> `FileExplorer` -> `SelectionPane`. Nothing about
        selection needs restructuring — the selected photo's id is `photo.id`, right here.
      */}
      <div className="mt-5 space-y-2 border-t border-rule pt-4">
        <Button
          size="md"
          fullWidth
          loading={pending}
          disabled={pending || photo.isCurrent}
          onClick={() => run(() => setCurrentNinaAvatarAction(photo.id))}
        >
          {photo.isCurrent ? 'Her profile picture' : 'Set as her profile picture'}
        </Button>

        {photo.description == null && (
          <Button
            size="md"
            variant="secondary"
            fullWidth
            loading={pending}
            disabled={pending}
            onClick={() => run(() => describeNinaAvatarAction(photo.id))}
          >
            Describe it
          </Button>
        )}

        <Button
          size="md"
          variant="destructive"
          fullWidth
          disabled={pending || photo.isCurrent}
          title={
            photo.isCurrent
              ? 'Make another photo hers first — she is never left without one.'
              : undefined
          }
          onClick={() => run(() => deleteNinaAvatarAction(photo.id), onRemoved)}
        >
          Remove
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[13px] font-semibold text-warn">
          {error}
        </p>
      )}
    </aside>
  )
}
```

**Impact:** `CropStudio` and `CircleFrame` keep their only two call sites' worth of usage, moved.
`saveNinaAvatarCropAction`, `setCurrentNinaAvatarAction`, `deleteNinaAvatarAction` and
`describeNinaAvatarAction` all keep exactly the callers they had; only the file changed.

---

### Step 8: The upload queue bar

**File:** `components/admin/explorer/UploadQueue.tsx` (new)
**Change:** One sticky line at the foot of the content column: the progress bar, the counts, and a
disclosure for the per-file detail.

**Code:**

```tsx
'use client'

import { useState } from 'react'

import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'
import type { UploadRefusal } from '@/lib/admin/filetree'
import { ADMIN_AVATAR_MAX_UPLOAD_BYTES } from '@/lib/admin/avatars'

import type { QueueItem, QueueReport } from './model'
import type { UploadPhase } from './useFolderUpload'

/**
 * What the upload is doing, in one line, with the detail one click away.
 *
 * ── A DROP THAT UPLOADS NOTHING MUST SAY SO ─────────────────────────────────────────────────
 * *"it automatically upload only the new folders and files as optimization"* has a failure mode the
 * requirement does not mention and the operator will hit on his second drop: **nothing happens.**
 * A queue that renders only in-flight work is indistinguishable from a broken page at that moment.
 * So `report.already` is on screen in words and numerals — *"Nothing new. All 313 files are already
 * here."* — and it is the single most important sentence this component says.
 *
 * ── ONE LINE BY DEFAULT, THREE HUNDRED ROWS NEVER ───────────────────────────────────────────
 * The summary is the interface. Expanded, the list shows every failure (which is what a human acts
 * on) plus a bounded window of what is moving, and then admits how many it is not drawing. A
 * three-hundred-row live list is a rendering cost paid for information nobody reads.
 *
 * ── THE NUMBERS ARE `tabular-nums`, LIKE EVERY OTHER NUMBER ON THIS SCREEN ──────────────────
 * Same treatment as the tree's counts and the pager's range: this screen's job is comparing sets of
 * files, so its numerals line up.
 */

const IN_FLIGHT_ROWS = 12

const STATE_TEXT: Record<QueueItem['state'], string> = {
  waiting: 'Waiting',
  thumbnailing: 'Reading',
  uploading: 'Uploading',
  registering: 'Saving',
  done: 'Done',
  error: 'Failed',
}

/**
 * One sentence per refusal reason. A `Record` over phase 2's union rather than a `switch` with a
 * default, so that adding a reason in `lib/admin/filetree.ts` fails the build here until it has a
 * sentence — the same guarantee `components/nina/Composer.tsx:123-127`'s `REJECTION_TEXT` gives.
 *
 * **Ten entries, not four.** `UploadRefusal` (phase 2's real name; the draft assumed
 * `UploadRefusalReason` with four members) is `FolderPathRejection | 'too_large' | 'empty_file' |
 * 'unnamed' | 'name_too_long'`, and `FolderPathRejection` contributes five of its own. The
 * exhaustive `Record` is what caught that: an incomplete map is a build error here, which is
 * exactly why it is a `Record` and not a `switch`.
 *
 * `rejected` files — the non-images — get no sentence at all and are never listed. The requirement
 * says they are skipped *automatically*, so they are a number in the headline and nothing more; a
 * list of two hundred `Thumbs.db` entries is not information.
 */
const REFUSAL_TEXT: Record<UploadRefusal, string> = {
  too_large: `Bigger than the ${Math.round(ADMIN_AVATAR_MAX_UPLOAD_BYTES / 1024 / 1024)} MB cap.`,
  empty_file: 'Zero bytes — a broken copy.',
  unnamed: 'No usable file name.',
  name_too_long: 'Its file name is too long.',
  too_deep: 'Nested deeper than the album allows.',
  path_too_long: 'Its folder path is too long.',
  segment_too_long: 'One of its folder names is too long.',
  bad_segment: 'Its folder or file name uses a character the album cannot store.',
  traversal: 'Its path tries to climb out of the album.',
}

export function UploadQueue({
  phase,
  items,
  report,
  error,
  onDismiss,
}: {
  phase: UploadPhase
  items: readonly QueueItem[]
  report: QueueReport | null
  error: string | null
  onDismiss: () => void
}) {
  const [open, setOpen] = useState(false)

  if (phase === 'idle' && error == null) return null

  const done = items.filter((item) => item.state === 'done').length
  const failed = items.filter((item) => item.state === 'error')
  const busy = phase === 'reading' || phase === 'planning' || phase === 'uploading'
  const percent = items.length === 0 ? 0 : Math.round((done / items.length) * 100)

  return (
    <div className="sticky bottom-0 mt-4 rounded-card border border-rule bg-card p-4 shadow-card">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-[13px] font-semibold text-ink">
          {headline({ phase, items, report, done, failed: failed.length })}
        </p>

        {items.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="shrink-0 text-[12px] font-semibold text-accent"
          >
            {open ? 'Hide the list' : 'Show the list'}
          </button>
        )}

        {!busy && (
          <Button size="md" variant="secondary" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-pill bg-rule"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Upload progress"
        >
          <div
            className="h-full rounded-pill bg-accent transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      {report != null && report.refused.length > 0 && (
        <ul className="mt-3 space-y-0.5">
          {report.refused.slice(0, IN_FLIGHT_ROWS).map((entry, index) => (
            /* `name`, not `path` — phase 2's `SkippedFile` carries the file's own display name,
               deliberately: several of these reasons ARE "the path could not be formed", so there
               is no joined path to show. The index is in the key because two refused files in two
               folders can legitimately share a name. */
            <li key={`${entry.name}-${index}`} className="text-[11px] font-medium text-warn">
              <span className="text-ink-2">{entry.name}</span> &mdash;{' '}
              {REFUSAL_TEXT[entry.reason]}
            </li>
          ))}
          {report.refused.length > IN_FLIGHT_ROWS && (
            <li className="text-[11px] font-medium text-ink-3 tabular-nums">
              and {report.refused.length - IN_FLIGHT_ROWS} more refused
            </li>
          )}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-warn">
          {error}
        </p>
      )}

      {open && (
        <ul className="mt-3 max-h-64 space-y-0.5 overflow-y-auto border-t border-rule pt-3">
          {failed.map((item) => (
            <li key={item.id} className="flex gap-2 text-[11px] font-medium">
              <span className="min-w-0 flex-1 truncate text-ink-2">{item.path}</span>
              <span className="shrink-0 text-warn">{item.error ?? 'Failed'}</span>
            </li>
          ))}
          {items
            .filter((item) => item.state !== 'done' && item.state !== 'error')
            .slice(0, IN_FLIGHT_ROWS)
            .map((item) => (
              <li key={item.id} className="flex gap-2 text-[11px] font-medium">
                <span className="min-w-0 flex-1 truncate text-ink-2">{item.path}</span>
                <span className="shrink-0 text-ink-3">{STATE_TEXT[item.state]}</span>
              </li>
            ))}
          <li className="pt-1 text-[11px] font-medium text-ink-3 tabular-nums">
            {done} of {items.length} finished
          </li>
        </ul>
      )}
    </div>
  )
}

/** The one line that has to be true at every moment of a gesture. */
function headline({
  phase,
  items,
  report,
  done,
  failed,
}: {
  phase: UploadPhase
  items: readonly QueueItem[]
  report: QueueReport | null
  done: number
  failed: number
}): string {
  if (phase === 'reading') return 'Reading the folder'
  if (phase === 'planning') return 'Checking what is already here'

  const skipped: string[] = []
  if (report != null && report.already > 0) skipped.push(`${report.already} already here`)
  if (report != null && report.rejected > 0) skipped.push(`${report.rejected} not images`)
  if (report != null && report.refused.length > 0) skipped.push(`${report.refused.length} refused`)
  if (failed > 0) skipped.push(`${failed} failed`)
  const tail = skipped.length > 0 ? ` · ${skipped.join(' · ')}` : ''

  if (items.length === 0) {
    // THE SENTENCE THIS COMPONENT EXISTS FOR. See the header.
    if (report == null) return 'Nothing to upload'
    if (report.already === report.found && report.found > 0) {
      return `Nothing new. All ${report.found} files are already here.`
    }
    return `Nothing new to upload${tail}`
  }

  if (phase === 'uploading') return `Uploading ${done} of ${items.length}${tail}`
  return `Uploaded ${done} of ${items.length}${tail}`
}
```

**Impact:** New. `ADMIN_AVATAR_MAX_UPLOAD_BYTES` gains a second client caller (it had one in
`UploadAvatar.tsx:60`, which is deleted, so the count is unchanged).

---

### Step 9: The explorer itself

**File:** `components/admin/FileExplorer.tsx` (new)
**Change:** The screen: toolbar, breadcrumb, the three-column shell, the drop target, the two file
inputs, and the state everything else reads.

**Code:**

```tsx
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui'
import { folderBreadcrumbs } from '@/lib/admin/filetree'
import { cn } from '@/lib/cn'

import { entriesFromDrop, filesFromDropList, filesFromPicker } from './explorer/dropWalk'
import { FolderTree } from './explorer/FolderTree'
import { PhotoGrid } from './explorer/PhotoGrid'
import { SelectionPane } from './explorer/SelectionPane'
import { UploadQueue } from './explorer/UploadQueue'
import { useFolderUpload } from './explorer/useFolderUpload'
import type { ExplorerFolder, ExplorerPageInfo, ExplorerPhoto } from './explorer/model'

export type { ExplorerFolder, ExplorerPageInfo, ExplorerPhoto } from './explorer/model'

/**
 * `/admin/nina` as a file manager — R1, in his words: *"can we make it so that the in /admin/nina
 * profile album, it looks like a file manager instead? this way i can upload nested folders, and
 * make the photos much more structured and easier to maintain."*
 *
 * The successor to `AlbumManager`, and the only upload path in `/admin`. `UploadAvatar` is gone with
 * it; two upload paths in one screen is how they drift apart.
 *
 * ── WHAT LIVES IN THE URL AND WHAT LIVES IN STATE, AND WHY THE SPLIT ────────────────────────
 * `?folder=` and `?page=` are in the URL because they decide **which rows exist**: the page has to
 * re-run `listNinaAvatarsInFolder` for them, so a folder click is a real `<Link>` navigation and a
 * folder is deep-linkable and back-button-able, which a file manager owes its user.
 *
 * The **selected photo is `useState`**, deliberately, and for precisely the reason
 * `components/ui/usePanelParam.ts` gives for `/me`'s panel: putting it in the URL would re-run a
 * Server Component that just did two database reads, on every click, for a state change that never
 * leaves the client. Both arguments are in this file at once; that is not an inconsistency, it is
 * the same rule applied to two different kinds of state.
 *
 * The consequence to notice: `selectedId` can name a photo that is not on this page any more (a
 * folder change, a page change, a delete). `photos.find(...) ?? null` is the whole handling — the
 * pane closes itself — which is `AlbumManager.tsx:50`'s idiom and needs no effect.
 *
 * ── THE LAYOUT IS THE DESKTOP LAYOUT `app/admin/layout.tsx` ALREADY ARGUED FOR ──────────────
 * *"in fact, i am thinking about a whole new page. but this UI is for desktop"* (F33 R23), and this
 * requirement opens with *"admin page (desktop usage)"*. So: no `AppShell`, no `TabBar`, no 470 px
 * column, and every token borrowed. Two rails and a canvas inside the layout's ~1080 px:
 * a 200 px folder tree, the content pane, and a 320 px details rail that opens on selection.
 * `min-w-0` on the middle track for the reason `app/admin/layout.tsx:51-52` states about its own:
 * without it a wide grid blows the track out instead of scrolling inside it.
 *
 * ── THE DROP TARGET IS THE CONTENT PANE ─────────────────────────────────────────────────────
 * Not a dashed box. A dashed drop box spends the one region that should hold photographs, and
 * `EmptyState`'s docstring reserves the dashed vocabulary for *"a different kind of thing"*. The
 * pane itself takes an inset accent ring while a drag is over it, and the copy names the
 * destination — because the destination genuinely is the folder on screen, and a drop whose landing
 * place is a guess is a drop nobody makes twice.
 *
 * `dragDepth` is a counter and not a boolean: `dragleave` fires when the pointer crosses into a
 * CHILD element, so a boolean flickers off over every tile in the grid.
 *
 * ── `webkitdirectory` IS SET IMPERATIVELY, AND THAT IS NOT A WORKAROUND ─────────────────────
 * React's `InputHTMLAttributes` carries no `webkitdirectory`, so it cannot be written as a JSX prop
 * without a cast that lies about the DOM. The DOM property is real and typed
 * (`HTMLInputElement.webkitdirectory`, `lib.dom.d.ts:14970`), so an effect sets it on the ref after
 * mount. Without it the file dialog cannot select a folder at all — it is the entire directory
 * picker, not a nicety.
 */

export function FileExplorer({
  userId,
  folders,
  photos,
  page,
}: {
  userId: string
  folders: readonly ExplorerFolder[]
  photos: readonly ExplorerPhoto[]
  page: ExplorerPageInfo
}) {
  const router = useRouter()
  const folder = page.folder

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

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

  const upload = useFolderUpload({ userId, destination: folder, onFinished })

  const selected = photos.find((photo) => photo.id === selectedId) ?? null

  const hrefFor = useCallback((next: string) => hrefForFolder(next, 1), [])
  const hrefForPage = useCallback((next: number) => hrefForFolder(folder, next), [folder])

  function select(id: string) {
    setSelectedId(id)
    setDetailOpen(true)
  }

  function onPickFolder(event: React.ChangeEvent<HTMLInputElement>) {
    const walked = filesFromPicker(event.target.files)
    event.target.value = '' // so re-picking the same folder fires change again
    if (walked.length === 0) return
    upload.start(walked)
  }

  function onDragEnter(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
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
   * component recomputing which one it is. */
  const trail = folderBreadcrumbs(folder)

  return (
    <div>
      {/* ── TOOLBAR ─────────────────────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
          <ol className="flex min-w-0 flex-wrap items-center gap-1 text-[13px] font-medium">
            {trail.map((crumb, index) => (
              <li key={crumb.path} className="flex min-w-0 items-center gap-1">
                {index > 0 && <span className="text-ink-3">/</span>}
                {crumb.isCurrent ? (
                  <span className="truncate font-semibold text-ink" aria-current="page">
                    {crumb.name}
                  </span>
                ) : (
                  <Link href={hrefFor(crumb.path)} className="truncate text-accent">
                    {crumb.name}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <span className="shrink-0 text-[12px] font-semibold text-ink-3 tabular-nums">
          {page.total} in this folder
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

        <Button size="md" variant="secondary" onClick={() => fileInputRef.current?.click()}>
          Add photos
        </Button>
        <Button size="md" onClick={() => folderInputRef.current?.click()}>
          Add a folder
        </Button>
        <Button
          size="md"
          variant="ghost"
          aria-pressed={detailOpen}
          onClick={() => setDetailOpen(!detailOpen)}
        >
          {detailOpen ? 'Hide details' : 'Show details'}
        </Button>
      </div>

      {/* ── THE THREE COLUMNS ───────────────────────────────────────────────────────────── */}
      <div
        className={cn(
          'grid items-start gap-5',
          detailOpen && selected != null
            ? 'grid-cols-[200px_minmax(0,1fr)_320px]'
            : 'grid-cols-[200px_minmax(0,1fr)]',
        )}
      >
        <FolderTree folders={folders} current={folder} hrefFor={hrefFor} />

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
            {dragging && (
              <p
                aria-live="polite"
                className="mb-3 text-[13px] font-semibold text-ink"
              >
                Drop into {trail.map((crumb) => crumb.name).join(' / ')}
              </p>
            )}

            <PhotoGrid
              photos={photos}
              page={page}
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

        {detailOpen && selected != null && (
          <SelectionPane
            photo={selected}
            onClose={() => setDetailOpen(false)}
            onRemoved={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  )
}

/**
 * The URL grammar, in one place so the tree, the breadcrumb and the pager cannot spell it
 * differently.
 *
 * The root folder is the ABSENCE of the parameter, not `?folder=`, and page 1 is the absence of
 * `?page=` — so the canonical `/admin/nina` and a navigated-back-to root are the same URL. A folder
 * path holds `/` and spaces, hence `encodeURIComponent` on the whole path rather than per segment.
 */
function hrefForFolder(folder: string, page: number): string {
  const params = new URLSearchParams()
  if (folder !== '') params.set('folder', folder)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query === '' ? '/admin/nina' : `/admin/nina?${query}`
}
```

**Impact:** Replaces `AlbumManager` as the screen body.

**One detail an implementer must not "clean up":** both `<input>`s share `onPickFolder` and differ
only in the `webkitdirectory` the effect sets on one of them. That is on purpose —
`filesFromPicker` handles `webkitRelativePath === ''` (an ordinary multi-file pick lands in the
current folder under its own name), so one handler is correct for both and a second one could only
drift.

---

### Step 10: The page — folder-scoped, paginated reads

**File:** `app/admin/nina/page.tsx:1-63` (whole file replaced)
**Change:** `PageProps<'/admin/nina'>`, `?folder=`/`?page=`, two folder-aware reads, the widened row
-> prop map, and `FileExplorer` in place of `AlbumManager`.

**Code:**

```tsx
import { FileExplorer } from '@/components/admin/FileExplorer'
import type { ExplorerFolder, ExplorerPhoto } from '@/components/admin/explorer/model'
import { NINA_FOLDER_ROOT, validateFolderPath } from '@/lib/admin/filetree'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { NINA_ADMIN_PAGE_SIZE, NINA_AVATAR_FALLBACK_SRC } from '@/lib/nina/album'
import { listNinaAvatarFolders, listNinaAvatarsInFolder } from '@/lib/nina/queries'

/**
 * `/admin/nina` — F33 R23's album, now the file manager this round's R1 asked for: *"can we make it
 * so that the in /admin/nina profile album, it looks like a file manager instead? this way i can
 * upload nested folders, and make the photos much more structured and easier to maintain. i will
 * put hundreds of profile pics in there."*
 *
 * Still a Server Component that does two things: gate, and hand one client component what it needs.
 * Every mutation is a Server Action in `lib/admin/ninaAlbumActions.ts`, so there is no `/api` route
 * on the write path and no client-side data fetching. What changed is the shape of the read.
 *
 * ── "HUNDREDS" IS WHY THIS PAGE IS PAGINATED AND FOLDER-SCOPED ──────────────────────────────
 * `listNinaAvatars(userId)` was unpaginated by design — F33's `NINA_ALBUM_MAX = 60` was a render cap
 * over rows already in hand, which was right for six generations a day. It is wrong for hundreds of
 * uploaded files: the query would return all of them, the RSC payload would carry all of them, and
 * the browser would lay out all of them. So the read is now `listNinaAvatarsInFolder`, one folder
 * and one page of `NINA_ADMIN_PAGE_SIZE` at a time, driven by `searchParams`.
 *
 * ── `searchParams` IS A PROMISE, AND `PageProps` IS HOW THIS REPO TYPES IT ──────────────────
 * Verified against this repo's own Next (16.3.1) rather than remembered:
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`, "Page Props
 * Helper" — *"You can type pages with `PageProps` to get strongly typed `params` and `searchParams`
 * from the route literal. `PageProps` is a globally available helper."* It also states, twice, that
 * `searchParams` is a promise and must be awaited, and that reading it opts the page into dynamic
 * rendering. `app/admin/layout.tsx:44` already uses the sibling `LayoutProps<'/admin'>`.
 *
 * `force-dynamic` therefore stays, but its job is unchanged and is not about `searchParams`: the
 * album is per-request state that must reflect the action that just ran, and
 * `revalidatePath('/admin/nina')` in every action is what makes that immediate.
 *
 * ── BOTH PARAMETERS ARE VALIDATED, NOT TRUSTED ──────────────────────────────────────────────
 * `?folder=` goes through phase 2's **`validateFolderPath`**, not through `normaliseFolderPath`,
 * and the difference is the whole point: the normaliser deliberately PRESERVES a `..` segment so
 * that exactly one function decides its fate, so normalising alone would hand `../../etc` to a
 * query as a folder name. It would not be a vulnerability (the read is `folder = $2`, exact-match
 * and `user_id`-scoped, so it returns nothing) but it would put an unrepresentable path in the
 * breadcrumb and in every link built from it. A refused path falls back to the album root, which is
 * the only sensible answer to a folder that cannot exist. `?page=` is parsed, floored at 1 and
 * capped, so `?page=99999999` cannot ask the database for a hundred-million-row offset. Neither is
 * a security boundary — `requireAdmin()` on line 1 is, and every read below is scoped to the id it
 * returns — but a page that hands unvalidated strings to a query is a page that will one day hand
 * it something worse.
 *
 * ── THE GATE IS HERE, AGAIN ─────────────────────────────────────────────────────────────────
 * `requireAdmin()` is the first statement, before `searchParams` is even awaited. `proxy.ts` matches
 * neither `/admin` nor `/api/*` (`lib/admin/requireAdmin.ts:13-16`), so this call and the layout's
 * and each action's are the only gates; `app/admin/layout.tsx:29-35` explains why all three exist
 * rather than one.
 *
 * SEAM — PHASE 7. `shareOrigin()` (`lib/share/origin.ts:25`) is read HERE and passed down as a prop.
 * It is `server-only` and invariant 9 forbids a `NEXT_PUBLIC_` for it, so the origin crosses to the
 * client the same way `userId` does: `<FileExplorer shareOrigin={shareOrigin()} … />`.
 */

export const dynamic = 'force-dynamic'

/** A hand-typed `?page=` cannot ask for an offset no album will ever reach. */
const PAGE_CEILING = 1000

export default async function AdminNinaPage(props: PageProps<'/admin/nina'>) {
  const { userId } = await requireAdmin()

  const params = await props.searchParams
  const requested = validateFolderPath(readOne(params.folder) ?? NINA_FOLDER_ROOT)
  const folder = requested.ok ? requested.path : NINA_FOLDER_ROOT
  const page = readPage(readOne(params.page))

  const [listed, folders] = await Promise.all([
    listNinaAvatarsInFolder(userId, folder, {
      limit: NINA_ADMIN_PAGE_SIZE,
      offset: (page - 1) * NINA_ADMIN_PAGE_SIZE,
    }),
    listNinaAvatarFolders(userId),
  ])

  /*
   * The row -> prop mapping is here rather than in the client component for the reason it always
   * was: `NinaAvatarRow` carries `announcedAt`, `pathname`, `sourceKey` and `thumbPathname`, none of
   * which a browser has any use for, and none of which should cross the serialization boundary
   * wholesale.
   *
   * `filename` falls back to the id because every row written before phase 1 added the column has
   * none, and a grid tile with no label under it is worse than a tile labelled by its id.
   */
  const photos: ExplorerPhoto[] = listed.rows.map((row) => ({
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
      <header className="mb-6">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">Nina&rsquo;s album</h1>
        <p className="mt-1 max-w-[70ch] text-[13px] font-medium text-ink-2">
          Drop a folder straight out of Explorer and only the new files upload. Click a photo to
          frame her face and make it her profile picture. Folders are metadata, not blob paths, so
          moving a photo moves no bytes.
        </p>
      </header>

      {albumTotal === 0 ? (
        <p className="mb-6 max-w-[70ch] rounded-card border border-rule bg-card p-5 text-[13px] font-medium text-ink-2">
          The album is empty, so she is still showing the committed photo (
          <code className="text-ink">{NINA_AVATAR_FALLBACK_SRC}</code>). Add a folder below and the
          first photo you make hers becomes her face.
        </p>
      ) : null}

      <FileExplorer
        userId={userId}
        folders={folderList}
        photos={photos}
        page={{
          folder,
          page,
          pageSize: NINA_ADMIN_PAGE_SIZE,
          total: listed.total,
        }}
      />
    </div>
  )
}

/**
 * `searchParams` values are `string | string[] | undefined` — a repeated parameter arrives as an
 * array. The first wins; there is no meaning to assign to a second `?folder=`.
 */
function readOne(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** 1-based, floored at 1, capped at `PAGE_CEILING`. Garbage reads as page 1. */
function readPage(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.min(parsed, PAGE_CEILING)
}
```

**Impact:** `listNinaAvatars` loses this call site (`page.tsx:24`). Its **three** other callers are
untouched, so the function stays: `lib/nina/actions.ts:151` (`resolveAttachment`'s ownership check),
`app/nina/about/page.tsx:32` (the mobile album) and `app/admin/page.tsx:20` (the `/admin` hub, which
reads the whole album to render `album.length`). The last of those is a problem this phase creates
and does not fix — see Handoffs.

---

### Step 11: Delete the two superseded components

**Files:** `components/admin/AlbumManager.tsx` (264 lines), `components/admin/UploadAvatar.tsx`
(178 lines)
**Change:** `git rm` both.

**Code:**

```
git rm components/admin/AlbumManager.tsx components/admin/UploadAvatar.tsx
```

…plus, in the same commit: the one-line docstring edit in `components/admin/CropStudio.tsx`, and
the removal of `registerNinaAvatarAction` from `lib/admin/ninaAlbumActions.ts`. Both are argued
below.

**Impact:** After Step 10 nothing **imports** either file. Confirm before committing:

```
grep -rn "AlbumManager\|UploadAvatar\|AlbumPhoto" app components lib tests scripts
```

Run today, that returns the two files themselves, `app/admin/nina/page.tsx:1,29,60` (Step 10
rewrites it) and **three docstring mentions in files this phase may not touch**:

| Site | Text | Owner |
|---|---|---|
| `components/admin/CropStudio.tsx:29` | *"The crop lives in `AlbumManager`…"* | **this phase** (reconciled) |
| `lib/admin/avatars.ts:7` | *"`components/admin/UploadAvatar.tsx` (a client module)…"* | Phase 1 (reconciled: assigned) |
| `lib/admin/avatars.ts:19` | *"see `UploadAvatar`'s header"* | Phase 1 (reconciled: assigned) |

**Reconciled: all three are now owned, and none is left stale.** The draft left them alone because
`CropStudio.tsx` is "reused VERBATIM" in this phase's scope and `lib/admin/avatars.ts` is phase 1's
file — correct as far as it went, but a docstring pointing at a file this commit deletes is a
dangling reference this commit created.

- **`CropStudio.tsx:29` is this phase's**, because this phase is what moves the crop and deletes the
  file that line names. One line, no behaviour: *"The crop lives in `AlbumManager`"* becomes *"The
  crop lives in `components/admin/explorer/SelectionPane.tsx`"*. `CircleFrame.tsx` needs nothing and
  stays untouched, and "reused verbatim" still holds for every line of `CropStudio` that runs.
- **`lib/admin/avatars.ts:7` and `:19` are phase 1's**, which is already editing that file; its
  Files table now says so. `:7`'s list of hosts becomes
  `components/admin/explorer/useFolderUpload.ts` (a client module), and `:19`'s pointer becomes
  `components/admin/explorer/thumbnail.ts`'s header, which is where the "do not re-encode the
  original" ruling is quoted in full.

Note also that `NinaAlbumPhoto` (`lib/nina/album.ts:124`) and `NinaAboutScreen`'s uses of it match
the same grep and are **unrelated** — that is `/nina/about`'s mobile album type, which this phase
does not touch.

**One more removal belongs in this commit:** `registerNinaAvatarAction` (singular) in
`lib/admin/ninaAlbumActions.ts`. Deleting `UploadAvatar.tsx` removes its only caller, and phase 4's
handoff asks for exactly this — *"If phase 5 removes the component, remove the singular action in
the same commit"* — so the tree never holds a dangling export or an action nothing calls. Confirm
with `grep -rn "registerNinaAvatarAction\b" app components lib tests` before and after; the only
match beforehand should be its own declaration and `UploadAvatar.tsx`.

This is the phase scope's *"do not leave two upload paths"*, executed rather
than promised — the alternative, keeping `UploadAvatar` beside the queue, gives the operator two
buttons that disagree about folders, dedupe keys and thumbnails.

---

## Verification

**Build:** `npm run typecheck` (which runs `next typegen` first, so `PageProps<'/admin/nina'>`
resolves), then `npm run build`.

**Tests:** `npm test`. **No new suite.** Every pure decision this phase depends on is
`tests/admin.filetree.test.ts`'s, which is phase 2's; what is left here is `DataTransferItem`,
`FileSystemDirectoryReader`, `OffscreenCanvas` and React, and `vitest.config.ts` runs
`environment: 'node'` with no jsdom. The plan index says so in as many words: *"A test for
`readEntries` batching does not live here; that is a browser API and phase 5's"* — and phase 5's
answer is the browser check below, because a fake `readEntries` that batches is a test of the fake.

**Lint / format:** `npm run lint`, `npm run format:check`.

**Guards** (`.github/workflows/ci.yml` runs these; none should be affected, and each is worth one
look because this phase adds a client module that talks to Blob):
`npm run ci:client-secret-guard`, `npm run ci:data-layer-guard`, `npm run ci:llm-payload-guard`,
`npm run ci:f08-guard`, `npm run ci:f11-guard`, `npm run ci:openrouter-guard`.

**Manual check — `npm run dev`, signed in as an `ADMIN_EMAILS` address, at `/admin/nina`.**
Nine things, and the first three are the phase:

1. **A nested folder from the picker.** "Add a folder", choose a folder with at least two levels and
   ~30 files. The tree grows the new folders, the grid fills, the queue says
   `Uploaded 30 of 30`. Navigate into a subfolder: the breadcrumb and the tree agree.
2. **The same folder dragged from Windows Explorer.** Drop it on the content pane. The pane rings
   accent and says *"Drop into …"*. The result must be **the same tree** as (1) — that is the
   exit criterion the two code paths exist to meet.
3. **The re-drop.** Drop it again. Nothing uploads and the bar says
   *"Nothing new. All 30 files are already here."* This is the requirement's *"automatically upload
   only the new folders and files"*, and the sentence is as much the feature as the skip is.
   Then add three files into a new subfolder on disk and re-drop: exactly three upload, and the new
   subfolder appears.
4. **`readEntries` batching, at scale.** A folder of **more than 100 files in one directory** —
   this is the whole point. `readEntries` returns at most 100 per call, so a truncating
   implementation uploads exactly 100 and looks fine. The count in the queue must equal the count in
   Explorer. Do not skip this one for a 40-file folder.
5. **Non-images.** Put a `.txt`, a `.mov` and a `Thumbs.db` in the folder. They are skipped, the bar
   counts them as *"N not images"*, and nothing errors.
6. **Hundreds of thumbnails.** With 200+ rows in one folder, open DevTools → Network → Img and
   reload. Every request must be a `thumb-*.jpg` of tens of kilobytes; **not one `avatar-*` request
   should appear** until a photo is selected. Rows uploaded before this phase are the exception and
   will request their original — that is the documented `thumbUrl == null` fallback. With
   `NINA_ADMIN_PAGE_SIZE = 120`, a 200-row folder is two pages: check the pager reads
   `1–120 of 200`, that **Newer** is inert on page 1, and that `?page=2` reads `121–200 of 200`.
7. **Set as profile picture.** Select a photo, click it. The button becomes *"Her profile picture"*,
   the grid tile gains its `Hers` band, and (phase 4) a description appears against **Nina** in the
   detail list within ~10 s. `/nina` shows the new face.
8. **The framing studio still saves a crop.** Drag and wheel in the 320 px studio, Save framing, then
   reload: the two sanity circles keep the new framing. Reset framing returns to centred.
9. **One bad file does not fail the batch.** Rename a `.txt` to `.jpg` and include it. It alone
   goes red with *"did not decode as an image"*; everything else lands.

**Exit criteria:** `/admin/nina` renders a folder tree, a breadcrumb, and one folder's page of
thumbnails; a nested folder both picked and dragged produces the same tree; a re-drop uploads nothing
and says so with a count; non-images are skipped and counted; a folder with more than 100 files in
one directory uploads all of them; the grid of hundreds issues only thumbnail requests; clicking a
photo selects it and one click makes it her profile picture; the framing studio still saves and
resets a crop; `AlbumManager.tsx` and `UploadAvatar.tsx` no longer exist and nothing references them;
`npm run typecheck`, `npm test`, `npm run lint`, `npm run format:check` all green.

---

## Handoffs

**To Phase 6 (folder maintenance) — three named seams:**

1. `components/admin/explorer/FolderTree.tsx`, the marked `SEAM — PHASE 6` comment at the end of
   `FolderTree`'s `<nav>`: the **New folder** control goes there and its parent folder is the
   component's `current` prop.
2. The same file's `Row` component is the **single place a folder is drawn** — rename, move and
   delete hang off it (a kebab button, or `onContextMenu`). Phase 6 adds one control to one
   component; it should not need to touch `Branch` or `FolderTree`'s recursion.
3. The **move target already exists**: `FileExplorer`'s `folder` is what the upload hook receives as
   `destination`, so "move these photos here" reuses the variable the drop path already resolves.

   **Reconciled — phase 6 acts on the SINGLE selection this phase builds, and does not widen it.**
   Phase 6's draft passed `selectedIds` (an array) and `clearSelection` to a `PhotoMoveBar`, while
   also promising *"I do not touch phase 5's selection model"* — those two cannot both hold, since
   `selectedId` is one `string | null` here. The reconciler resolved it toward the smaller change:
   phase 6's `PhotoMoveBar` reads `selectedId` and calls the actions with `ids: [selectedId]`. The
   actions keep their array shape, so multi-select later is a client-only change. Three reasons it
   goes this way rather than widening the model: the plan index's phase-6 scope is *"the create /
   rename / move / delete **folder** actions"* and never asks for bulk photo operations; R1's own
   words are *"we can click **a** photo"*; and widening `selectedId` to a `Set` during a
   three-way parallel edit of `FileExplorer.tsx` (phases 5, 6 and 7 all touch it) is the change
   most likely to conflict for the least requirement served. Multi-select stays the follow-up card
   below.
4. Deliberately **not** built here: this phase's `SelectionPane` Remove button calls
   `deleteNinaAvatarAction` one row at a time. A recursive folder delete is phase 6's, and so is
   surfacing `deleteNinaAvatar`'s refusal of the current photo across a whole subtree
   (`lib/admin/ninaAlbumActions.ts:176-183`'s argument, applied to N rows).

**To Phase 7 ("Share link to Nina") — one named seam:**

`components/admin/explorer/SelectionPane.tsx`, the marked `SEAM — PHASE 7` comment above the action
list. One more `<Button>` under *"Set as her profile picture"*, and a `shareOrigin: string` prop
threaded `app/admin/nina/page.tsx` -> `FileExplorer` -> `SelectionPane` — the page's docstring names
that too, with the invariant-9 reason. The selected photo's id is `photo.id`, in scope. **Phase 7
should be adding one button and one prop, not restructuring the selection model.**

**To Phase 1 (or the reconciler) — two stale docstring references:**

`lib/admin/avatars.ts:7` and `:19` both name `components/admin/UploadAvatar.tsx`, which this phase
deletes. Phase 1 is already editing that file (the folder bounds and the thumbnail pathname builder),
so it is the cheapest place to reword them — *"`components/admin/explorer/useFolderUpload.ts` (a
client module)"* and a pointer at `components/admin/explorer/thumbnail.ts`'s header, which is where
the "do not re-encode the original" ruling is now quoted in full. This phase does not touch
`lib/admin/avatars.ts`.

**A stale reference nobody owns:** `components/admin/CropStudio.tsx:29` says *"The crop lives in
`AlbumManager`"*. It now lives in `SelectionPane`. This phase's scope names `CropStudio.tsx` as
reused **verbatim**, so the line is left alone rather than fixed as a drive-by; it is one word and it
is worth a card.

**Left for someone, deliberately not done here:**

- **`app/admin/page.tsx:20` reads the whole album to render a count — ASSIGNED to phase 1 by the
  reconciler.** The `/admin` hub does `listNinaAvatars(userId)` and uses nothing but `album.length`
  (`app/admin/page.tsx:38-42`). Today that is a handful of rows; after this phase it is *"hundreds
  of profile pics"* fetched in full — every column, every URL, every description — on every visit
  to the hub, to print one integer. This phase found it and correctly could not fix it, since
  `lib/nina/queries.ts` is phase 1's and `app/admin/page.tsx` was in nobody's scope. It is now
  phase 1's Step 16: a `countNinaAvatars(userId)` beside the other album reads, and one expression
  at the one call site. It lands in phase 1 rather than as a card because phase 1 owns the query
  layer, lands first — so the fix is in before the album grows — and the alternative was an unowned
  impact point, which is the class of gap this reconciliation exists to close.
- **A byte formatter.** `ExplorerPhoto.bytes` is carried and never rendered, because invariant 8 says
  every rendered number comes from `lib/format.ts` and `lib/format.ts` has no `formatBytes`. Adding
  one is a two-line change to a file no phase in this set owns, and doing it here would be scope
  creep into a shared module during a seven-way parallel edit. Until then the pane shows pixels, and
  the only size on screen is the 8 MB cap in `REFUSAL_TEXT`, which is a constant rather than a
  formatted value.
- **`scripts/blob-reap.mjs` still does not know the `nina/` prefix** (ruling D4's open card). This
  phase *widens* the orphan exposure — a batch that dies between a PUT and its register chunk leaves
  objects nothing points at — and says so in `useFolderUpload.ts`'s header, but it does not close the
  card. That is a script, not a component, and it is out of this phase's scope.
- **`NINA_ALBUM_MAX = 60`** still caps `/nina/about`'s mobile grid over an unpaginated
  `listNinaAvatars`. Phase 1 owns restating what it means; this phase no longer reads it. If the
  album really does reach hundreds, `/nina/about` becomes the next screen to paginate — worth a card,
  not worth this phase.
- **Multi-select and keyboard navigation in the grid.** Arrow keys and shift-click are what would
  make this feel like Explorer rather than resemble it. Single selection is what R1 asks for
  (*"we can click a photo and select it as profile picture"*), and the reconciler kept phase 6 on
  the single selection for that reason (see handoff 3 above) — so this stays a card rather than
  becoming phase 6's problem. When it is picked up: widen `selectedId` to a `Set<string>` in
  `FileExplorer` and `PhotoGrid` only; `SelectionPane` takes one `photo` and should stay that way,
  and phase 6's move/remove actions already take arrays, so nothing on the server changes.

---

## Rollback

This phase is a commit (or a short run of commits) on `feature/admin-album-file-manager` and reverts
alone, in front of phases 6 and 7 and behind nothing:

```
git revert <phase-5 commit(s)>
```

`AlbumManager.tsx` and `UploadAvatar.tsx` come back with it, `app/admin/nina/page.tsx` returns to its
single unpaginated `listNinaAvatars` read, and the screen is F33's album again. Phases 1, 2 and 4
remain landed and are all additive: the new columns are nullable-or-defaulted, `lib/admin/filetree.ts`
loses its only consumer and becomes unused-but-tested capability, and phase 4's
`registerNinaAvatarsAction` loses its only caller while `registerNinaAvatarAction` (singular) — which
phase 4 is required to keep working — is what the restored `UploadAvatar` calls. So a revert of this
phase alone builds and passes tests.

**What a revert does not undo, and does not need to:** rows already written with a `folder`, a
`source_key` and a `thumb_blob_url`. The restored screen ignores all three and renders every row in
one flat grid, which is exactly what it did before any of them existed. The thumbnail blobs become
orphans that no row column is read from — recoverable, and the same exposure the store already
carries.

**If only the pagination is the problem** (a folder-scoped read that turns out to be wrong), the
smallest safe patch is `page.tsx` alone: read `listNinaAvatars(userId)`, pass every row as one page
with `total = rows.length` and `pageSize = rows.length`. `FileExplorer` needs no change, the tree
still builds from `row.folder`, and the pager collapses to a single page. That is a five-line
fallback and it is worth knowing before it is needed.
