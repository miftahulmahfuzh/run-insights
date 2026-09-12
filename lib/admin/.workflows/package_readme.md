# Package: admin

**Location**: `lib/admin`
**Last Updated**: 2026-09-12 — full rewrite/compaction against the current tree (every export
block, signature, constant and reverse dependency re-verified mechanically; the per-task changelog
this file used to carry inline now lives in `git log -- lib/admin`, see *Recent Changes*).

## Overview

`lib/admin` is everything behind `/admin/**`: the authorization boundary itself, the admin
surfaces' Server Actions, the Zod schemas that validate every byte those actions accept from a
browser, and the pure planning libraries (`filetree.ts`, `folderOps.ts`) that decide — without a
database — what a folder upload or a folder maintenance operation is allowed to do.

The surfaces: `/admin/nina` (the explorer: her album **and** the media collection formerly
mounted at `/admin/photos`), `/admin/personality` (character panel + text-model select),
`/admin/memory`, `/admin/shortcuts`, `/admin/image-generation`, `/admin/error-logs` (read-only:
every failed LLM call, tabbed Text / Multimodal / Image generation). There is no `/admin/photos`
route any more; `ADMIN_CHAT_PHOTOS_PATH` is `'/admin/nina'`.

It is a *boundary-plus-actions* package. Nothing in it is a general utility: every export exists
because one admin screen needs it, and the organising rule is that a value with two readers has
exactly one definition — `schema.ts` imports every bound it enforces rather than re-spelling one.

**Key Responsibilities:**

- Be the actual authorization boundary for `/admin/**`. `proxy.ts` matches neither `/admin` nor
  `/api/*`, so `requireAdmin()` / `requireAdminApi()` are the only thing between a signed-in
  stranger and Nina's album.
- Validate every admin input at the boundary with Zod, importing each bound from the module that
  owns it.
- Own the album's write side: register a dropped folder, promote, crop, describe (by model or by
  hand), adopt a chat photo, delete, and maintain folders (create/rename/move/delete, bulk
  move/remove).
- Own the media collection's write side: add (with write-time dedupe), replace, remove (with
  blob release), describe, and the hand-written description edit.
- Own `/admin/memory`'s write side (four actions), and make it structurally impossible to write
  a memory row without the `admin` source label.
- Own `/admin/shortcuts`'s write side, and make it structurally impossible for a caller — or a
  forged POST — to supply a `match_key` or a `kind` that disagrees with its own trigger.
- Decide an upload or a folder operation in pure, import-free (or zod-only) modules that a
  `'use client'` explorer can share verbatim with the server.
- Give `/admin/error-logs` — the one read-only surface here, no Server Action of its own — its
  pure half (URL grammar, row→prop mapping) with **zero imports**, so the client list never
  bundles a database module or a Zod schema.

## Module map

| File | Environment | Purpose |
|---|---|---|
| `requireAdmin.ts` | `server-only` | The boundary. Page/action flavour, Route Handler flavour, canonical refusal body. |
| `avatars.ts` | pure | Album blob pathname shapes, content types, size caps, id regex, TTLs — original and thumbnail. |
| `filetree.ts` | pure, **zero imports** | Folder-path grammar, file classification, dedupe key, `planFolderUpload`, tree building, the explorer's album/Media view switch. |
| `folderOps.ts` | pure (zod) | Folder *maintenance*: the six operations' schemas and the planners that refuse without a database. |
| `schema.ts` | pure | Every Zod schema `/admin/**` accepts. Imports every bound; declares none. |
| `ninaAlbumActions.ts` | `'use server'` | The album's write side: 15 actions — describe/edit prose, face, crop, delete, folder register/manifest, folder maintenance. |
| `chatPhotos.ts` | pure | The media collection's vocabulary: pathname shapes, ceilings, id regexes, the carrier-message rule, `planChatPhotoAddWrite`'s types. |
| `chatPhotoSchema.ts` | pure | Every Zod schema the media collection accepts. Separate from `schema.ts` (different table, different route). `schema.ts` imports from it. |
| `chatPhotoActions.ts` | `'use server'` | Six actions: add, replace, find-duplicate, remove, describe, edit description. |
| `users.ts` | `server-only` | The unscoped account enumeration the memory page's picker (and others) need. |
| `memoryModel.ts` | pure | Memory bounds, the seven categories, and `MemoryRow` — the one row model of `/admin/memory`. |
| `memoryVocab.ts` | `server-only` in practice (no pill; a test imports it) | The bridge from the closed slot vocabulary to the page's rows: `buildMemoryRows`, `canonicaliseSlotValue`. |
| `memoryStore.ts` | `server-only` | The only file naming a phase-1 memory writer; forces the `admin` label. |
| `memoryActions.ts` | `'use server'` | The four memory actions: save a slot, insert a fact, edit a fact, delete a row. |
| `tuningActions.ts` | `'use server'` | One action: the whole-tuning save. (The reset action was deleted with the buttons.) |
| `tuningModel.ts` | pure (client-safe) | The character panel's client-safe half: copy, draft shape, unsaved-field diff, auto-save merge. |
| `shortcutModel.ts` | pure | The shortcuts row model, page ceiling, field tuple, formatters — and the one re-export of phase 1's three caps. |
| `shortcutStore.ts` | `server-only` | The only `lib/admin` module that writes a shortcut. Owns the duplicate catch, the empty-trigger refusal, the read's ordering and ceiling. |
| `shortcutActions.ts` | `'use server'` | The four shortcut actions: add, save one cell, toggle `enabled`, delete. |
| `imageGenModel.ts` | pure | The image-generation draft: copy, reference-key round trip, draft diff, auto-save merge, dial debounce. |
| `imageGenActions.ts` | `'use server'` | Three actions: the one whole-prefs save, the test dispatch, the test read. |
| `imageGenTestView.ts` | pure | The test job's verdict vocabulary and poll schedule — a lookup over `nina_turns.error_code`, never a second classifier. |
| `textModelActions.ts` | `'use server'` | One action: save the narrative text model (`app_settings`, not `nina_tuning`). |
| `shareToNina.ts` | pure | `ninaPhotoShareUrl` — the album photo → her chat link, as a URL. |
| `errorLogModel.ts` | pure, **zero imports** | `/admin/error-logs`' pure half: the `?tab=`/`?page=` grammar, the Jakarta timestamp, the timeout fold, row→prop. |

## Exported API

### `requireAdmin.ts` — the boundary

```ts
export interface AdminIdentity { userId: string; email: string }
export async function getAdminIdentity(): Promise<AdminIdentity | null>
export async function requireAdmin(): Promise<AdminIdentity>
export async function requireAdminApi(): Promise<AdminIdentity>
export class AdminForbiddenError extends Error { readonly status = 404 }
export function forbiddenJson(): Response
```

`requireAdmin()` is line 1 of every admin page and every admin Server Action. Both of its exits
throw a framework control-flow error: call it FIRST, never wrap it in a bare try/catch.

- **No session → `redirect('/')`** (the sign-in screen — the useful next step).
- **Signed in, not an admin → `notFound()`** — `/admin/nina` and `/admin/nonsense` answer
  identically, and signing in again will not help.
- `requireAdminApi()` throws `UnauthorizedError` (401, imported from `@/lib/auth/requireUserId`,
  not redefined) or `AdminForbiddenError` (404) so one catch serves both; `forbiddenJson()` is
  its canonical refusal body.

### `avatars.ts` — where an album blob lives and how big it may get

```ts
export const ADMIN_AVATAR_EXTS = ['jpg', 'png', 'webp'] as const
export const ADMIN_AVATAR_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const ADMIN_AVATAR_MAX_UPLOAD_BYTES = 8 * 1024 * 1024
export const ADMIN_AVATAR_THUMB_MAX_UPLOAD_BYTES = 512 * 1024
export const ADMIN_AVATAR_MIN_EDGE_PX = 256
export const ADMIN_AVATAR_MAX_EDGE_PX = 12_000
export const ADMIN_AVATAR_ID_RE = /^[A-Za-z0-9_-]{12}$/
export const ADMIN_AVATAR_TOKEN_TTL_MS = 10 * 60 * 1000
export const ADMIN_AVATAR_CACHE_MAX_AGE = 60 * 60 * 24 * 365

export function adminAvatarPathname(userId, id, ext): string
export function adminAvatarThumbPathname(userId, id, ext): string
export function extForContentType(contentType: string): AdminAvatarExt | null
export function contentTypeForAvatarExt(ext: AdminAvatarExt): AdminAvatarContentType
export function isAdminAvatarRequestPathname(pathname, userId): boolean
export function isAdminAvatarThumbRequestPathname(pathname, userId): boolean
```

Two pathname shapes (`nina/<uid>/avatar-<id>.<ext>`, `nina/<uid>/thumb-<id>.<ext>` — the
thumbnail **carries the avatar's id**, which is what makes an orphaned thumbnail findable), two
predicates (the caller must know WHICH shape, because the caps differ 8 MB vs 512 KB), and the
request regex is a different shape from the stored pathname because `addRandomSuffix: true` means
Blob rewrites what it was asked for. `NINA_BLOB_PREFIX` is imported from `lib/nina/images.ts` —
the store layout has one spelling.

### `filetree.ts` — the file manager's decisions, before anything touches the network

**This module has no imports at all, and must not acquire one.** Its readers are a `'use client'`
explorer, a `'use server'` action module, a Route Handler and the unit suites; one server-side
import and the client half stops compiling. Do not import `avatars.ts` for the byte cap —
`planFolderUpload` takes `maxBytes` as an argument precisely so the cap keeps one home.

```ts
// bounds and grammar
export const NINA_FOLDER_ROOT = ''            // the album root; '' and not '/' or null
export const NINA_FOLDER_ROOT_LABEL = 'Album'
export const NINA_FOLDER_SEPARATOR = '/'
export const NINA_FOLDER_MAX_DEPTH = 8
export const NINA_FOLDER_MAX_SEGMENT_CHARS = 64
export const NINA_FOLDER_MAX_PATH_CHARS = 512
export const NINA_FILENAME_MAX_CHARS = 200
export const NINA_FOLDER_FORBIDDEN_RE = /[\u0000-\u001f\u007f<>:"\\|?*]/
export const NINA_SOURCE_KEY_VERSION = 'v1'
export const NINA_SOURCE_KEY_MAX_CHARS = 800

// paths: normaliseFolderPath, validateFolderPath, foldFolderPath, splitFolderPath,
//   folderDepth, folderName, folderParent, joinFolderPath, folderAncestors,
//   folderBreadcrumbs, isFolderAncestorOf, isInFolderTree, sanitiseFolderSegment
// files: fileExtension, classifyFile, sourceKeyFor
// planning and tree: planFolderUpload, folderCounts, buildTree, findFolderNode
// the explorer's view switch (the Media pane):
export const NINA_MEDIA_VIEW_PARAM = 'view'
export const NINA_MEDIA_VIEW_VALUE = 'media'
export const NINA_MEDIA_NODE_LABEL = 'Media'
export type ExplorerView = 'album' | 'media'
export function readExplorerView(raw: string | string[] | undefined): ExplorerView
export function mediaViewNode(count: number): MediaViewNode   // MediaViewNode is module-private
```

`NINA_FOLDER_FORBIDDEN_RE` is a DENY list matched unanchored (`!RE.test(value)`) with **no `g`
flag**, because a global regex reused with `.test` carries `lastIndex` and starts answering
`false` to input it just rejected — which is what makes it safe to share between a loop here and
a `.refine()` in `schema.ts`.

`planFolderUpload<T extends LocalFileLike>` (see `PlannedUpload<T>`, exported) partitions a
walked folder into `upload` / `existing` / `rejected` / `refused` plus `folders` and `counts`.
The per-file check order is load-bearing: **name → kind → shape → bytes → novelty** — a
`Thumbs.db` nine folders deep reads as "not an image" (silent), not "too deep" (reported).
`base` is the folder the drop landed in; the same files dropped at the root and inside `Faces`
are genuinely two different sets. Rejections are returned, never thrown; sorting uses plain
`<`/`>` on the folded form (host-`localeCompare` broke the suite's ability to assert an order),
which is the known lexicographic-not-natural limitation. `folders` lists only folders `upload`
will create: **an empty directory in a dropped tree appears nowhere** — a browser hands over a
flat list of FILES. Empty folders are durable (`nina_folders`) but only *"New subfolder"* makes
one.

The Media view half (`readExplorerView`, `mediaViewNode`) is the `?view=media` read path: the
explorer renders a virtual read-only "Media" node built from the chat-photo collection instead
of the album tree. Pure like the rest of the file so the client can parse the URL param with the
same grammar the server does.

### `folderOps.ts` — folder maintenance, decided without a database

```ts
export const ADMIN_FOLDER_OP_MAX_IDS = 500    // blast radius of one move/remove, not a body bound
export const folderCreateSchema  // { parent, name }
export const folderRenameSchema  // { folder, name }
export const folderMoveSchema    // { folder, parent }
export const photoMoveSchema     // { ids[1..500], folder }
export const folderDeleteSchema  // { folder, keepCurrent: boolean }
export const photoRemoveSchema   // { ids[1..500], keepCurrent: boolean }
export type FolderPlan = { ok: true; folder: string } | { ok: false; error: string }
export function planFolderCreate(args): FolderPlan
export function planFolderRename(args): FolderPlan
export function planFolderMove(args): FolderPlan
export interface CurrentPhotoRef { id: string; folder: string; filename: string | null }
export function describeCurrentPhoto(current): string
export function currentPhotoRefusal(current: CurrentPhotoRef | null, keepCurrent: boolean): string | null
export function currentPhotoKeptNote(current): string
```

Why a separate module: `ninaAlbumActions.ts` is `'use server'` and may export only async
functions, so Zod schemas and pure predicates need a home that is not `schema.ts` — and the
schemas sit beside the planners that consume their output. `folderOps` imports zod (no component
reaches zod), so the tree still reaches `filetree.ts` for path arithmetic without reaching this
file.

The design facts worth keeping:

- **Moving a folder is an UPDATE of one column. No blob is copied.** Blob layout stays flat;
  a rename of four hundred photographs writes four hundred `folder` cells and moves zero bytes.
  The price: two folders that come to share a path are indistinguishable, so a collision must be
  refused rather than merged.
- **The destination tree must be EMPTY.** Renaming `Bali` onto `Trips` would be a merge, and a
  merge of a folder column is not undoable — every other operation here is reversible by its
  inverse, this one would not be. Merging stays available as the *explicit* gesture: select the
  photos and move them.
- **A folder cannot land inside itself**, and the depth bound is checked against the DEEPEST
  descendant after the move, not against the destination.
- **The current photo cannot be removed.** SQL already refuses it (`isCurrent = false` in every
  delete's WHERE); `currentPhotoRefusal` makes the stand explicit BEFORE any row is touched —
  refuse by default, or with `keepCurrent: true` (a required boolean, not a defaulted one) run
  the delete and say what stayed via `currentPhotoKeptNote`. A partial delete of hundreds of rows
  has no inverse; refusing beats half-succeeding.
- `keepCurrent` exists on `folderDelete`/`photoRemove` and nowhere else; `folder` emptiness on a
  delete is refused by the ACTION ("the album root is not a folder" is a sentence, not a field
  error).

### `schema.ts` — the boundary's Zod layer

```ts
export const avatarIdSchema            // type AvatarDescriptionInput via avatarDescriptionSchema
export const cropWriteSchema           // type CropWrite
export const avatarDescriptionSchema   // { id, description } — the album prose edit
export const avatarRegisterSchema      // type AvatarRegister — live caller: explorer/thumbnail.ts
export const userIdSchema
export const slotKeySchema
export const slotEditSchema            // type SlotEdit
export const factInsertSchema          // type FactInsert
export const factEditSchema            // type FactEdit
export const memoryDeleteSchema        // type MemoryDelete — discriminated union on kind
export const folderPathSchema
export const albumFilenameSchema
export const sourceKeySchema
export const avatarBatchRecordSchema   // type AvatarBatchRecord
export const avatarBatchRegisterSchema // type AvatarBatchRegister
export const albumManifestSchema       // type AlbumManifestRequest
export const ninaTuningWriteSchema     // type NinaTuningWriteInput
export const shortcutInsertSchema      // type ShortcutInsert
export const shortcutCellSchema        // type ShortcutCell — discriminated union on `field`
export const shortcutToggleSchema      // type ShortcutToggle
export const shortcutDeleteSchema      // type ShortcutDelete
export const ninaImagePrefsWriteSchema // type NinaImagePrefsWriteInput
```

**Every bound here is imported, none is declared**: the folder bounds from `filetree.ts`,
`NINA_ADMIN_BATCH_MAX` from `lib/nina/album.ts`, the crop range from `lib/nina/crop.ts`, the
blob bounds from `avatars.ts`, the memory bounds from `memoryModel.ts`, the tuning bounds from
`lib/nina/tuning.ts`, the image-prefs bounds and vocabularies from `lib/nina/imageprefs.ts`.
A duplicated number is a number that will one day disagree.

Facts per schema worth keeping (all verified in source):

- `folderPathSchema` **validates a canonical path; it does not normalise one** — it wraps
  `validateFolderPath` and adds the identity check (`result.ok && result.path === value`).
  Normalisation is the browser's job; a server-side rewrite would store a dedupe key from path A
  against a row sitting at path B. `.max()` runs before `.refine()`; `''` (the album root) is
  VALID — every pre-F34 row has it by column DEFAULT.
- `albumFilenameSchema` is not `folderPathSchema` on one segment: 64 for a typed segment, 200 for
  a disk filename. On top of the shared character class it refuses `/` explicitly (the deny list
  forbids `\` but `/` is the separator `filetree` has already split on), trailing space and
  trailing dot (Win32 strips both), and `.` / `..` by name.
- `sourceKeySchema` is the dedupe key as a shape: `(normalised relative path, size, lastModified)`
  folded by `sourceKeyFor`. The 800-character cap is a STORAGE bound — `(user_id, source_key)` is
  a unique b-tree index and a b-tree tuple cannot exceed ~2704 bytes. The exclusion is `\p{Cc}`,
  not a positive class: a folder called `naïve` must round-trip.
- The batch schemas: a record's blob fields are spelled exactly as `avatarRegisterSchema` spells
  them; no `makeCurrent`; `thumb` is a nullable OBJECT (`{ url, pathname }`) so "has a thumbnail"
  cannot be half-true — **nullable is deliberate** (a failed canvas encode must not throw away a
  completed PUT). The envelope is an object holding one array; `NINA_ADMIN_BATCH_MAX` (50) makes
  `insertNinaAvatars`' throw unreachable. **All-or-nothing at the boundary, on purpose**: a
  record that fails here is a client bug, and a partial-success path would let that bug write
  half a batch invisibly.
- `memoryDeleteSchema` is a discriminated union on `kind` (`slot` | `promise` | `fact`) — the one
  delete control's three branches, exhaustive by construction. The four per-kind schemas it
  replaced (`slotRetire`, `promiseRemove`, `factRetract`, `factPurge`) are gone with the actions
  they served.
- `ninaTuningWriteSchema` validates the whole tuning as one object — every bound imported from
  `lib/nina/tuning.ts` — and each trait is **validated, not clamped** (clamping is the assembler's
  job; a Zod refusal is a message, a clamp is a silent coercion). There is no reset schema: the
  reset action was deleted with the buttons.
- `shortcutCellSchema` is a discriminated union on `field` because the three cells have three
  different caps. **`match_key` and `kind` are absent from all four shortcut schemas** — both are
  derived inside `lib/nina/queries.ts`'s write statements, so a forged POST has nowhere to put a
  folded key that disagrees with its own trigger.
- `ninaImagePrefsWriteSchema` is the one whole-row save's boundary: `focus` is a `strictObject`
  with every key required (an absent key must not read as "off"); the editable
  `promptTemplate` goes through `validateNinaImageTemplate` — the SAME function the assembler
  re-checks at render — so an unknown `{{placeholder}}` or a missing `{{camera}}`/`{{subject}}`/
  `{{scene}}` is refused at the boundary; `model` is a closed enum (`NINA_IMAGE_MODEL_IDS`) so a
  stale client cannot put an unverified camera id on the wire.

Two layers of bounds, and why both: Zod cannot know an image's aspect ratio, so `cropWriteSchema`
enforces the SHAPE and the action re-runs `clampCrop` against the row's real `width`/`height`.
Neither alone is sufficient.

### `ninaAlbumActions.ts` — the album's write side

```ts
export interface AdminActionResult {
  ok: boolean; error?: string
  id?: string; description?: string   // describe/edit actions, so a caller can render without a refetch
  folder?: string; count?: number     // folder ops: where to look now, how many rows actually moved
  note?: string                       // a true sentence about a non-failure (e.g. what keepCurrent left)
}

// describe / prose
export async function describeNinaAvatarAction(rawId): Promise<AdminActionResult>
export async function editNinaAvatarDescriptionAction(input): Promise<AdminActionResult>
export async function ensureNinaAvatarDescriptionAction(rawId): Promise<AdminActionResult>
// face
export async function setCurrentNinaAvatarAction(rawId): Promise<AdminActionResult>
export async function setChatPhotoAsAvatarAction(input): Promise<AdminActionResult>
// crop, delete
export async function saveNinaAvatarCropAction(input): Promise<AdminActionResult>
export async function deleteNinaAvatarAction(rawId): Promise<AdminActionResult>
// folder upload
export async function registerNinaAvatarsAction(input): Promise<AdminBatchRegisterResult>  // result type module-private
export async function listNinaAlbumManifestAction(input): Promise<AdminManifestResult>     // result type module-private
// folder maintenance (planners in folderOps.ts)
export async function createNinaAlbumFolderAction(input): Promise<AdminActionResult>
export async function renameNinaAlbumFolderAction(input): Promise<AdminActionResult>
export async function moveNinaAlbumFolderAction(input): Promise<AdminActionResult>
export async function deleteNinaAlbumFolderAction(input): Promise<AdminActionResult>
export async function moveNinaAvatarsAction(input): Promise<AdminActionResult>
export async function removeNinaAvatarsAction(input): Promise<AdminActionResult>
```

Every action opens with `requireAdmin()` and is scoped to the ids it returns. `AdminManifestEntry`,
`AdminBatchRegisterResult` and `AdminManifestResult` are module-private shapes (unexported
2026-09-11); callers consume them structurally off the actions' return types — prefer
`Awaited<ReturnType<typeof …>>` over re-exporting.

**Where a description is earned.** `describeNinaImages` is OFF every upload path. It runs at
exactly the moments `nina_avatars.description` is read by anyone: promotion (`setCurrentNinaAvatarAction`
and the batch's empty-album promotion, both via the `after()`-based private `scheduleDescribe`,
which skips an already-described row), the share path (`ensureNinaAvatarDescriptionAction`), and
on demand (`describeNinaAvatarAction` — also the manual re-describe, which OVERWRITES hand-written
prose). A describe call is ~8–11 s and Server Actions dispatch one at a time per client, so
awaiting it per upload would add three hundred latencies instead of overlapping them. The album
describe uses the `'self'` subject (via `describeSubjectForSide('hers')`) — every album row is a
photograph of HER; the runner-default prompt went looking for a man who is not in the frame.

**`editNinaAvatarDescriptionAction`** is the album twin of the media collection's hand-written
edit: no model call, no `after()`, empty box clears to NULL (D1), and it revalidates
`/admin/nina`. An empty description degrades honestly — her context's avatar block omits it.

**`setChatPhotoAsAvatarAction`** adopts a media-collection photograph as her face: it refuses
reference rows (`source_avatar_id`/`source_image_id` — make the original hers instead), clamps
the framing against the row's REAL dimensions server-side, copies the row into the album under
the stable `sourceKey` `` `chat-photo:<id>` `` (idempotent — a second adoption finds the existing
row via `getNinaAvatarBySourceKey`), and schedules a describe only if the copied row has none.

**`registerNinaAvatarsAction`** — the album's *only* writer of new rows (the singular action was
deleted with `UploadAvatar.tsx`; nothing lands a row without a `folder` and a `source_key`).
**Parallel bytes, batched bookkeeping**: blob PUTs go through the Route Handler in parallel;
Server Actions serialise, so registration batches at `NINA_ADMIN_BATCH_MAX` (50). Verified
mechanics: intra-batch dedupe on `sourceKey` (first writer wins); ONE read per batch for "does a
current row exist"; `declareNinaFolders` once per batch BEFORE the insert (a declared-but-empty
folder after a throw is a harmless leftover; the reverse order leaves photographs in a folder
nothing declared); `insertNinaAvatars` is `ON CONFLICT (user_id, source_key) DO NOTHING …
RETURNING` so idempotence is a constraint, not a convention — `skipped = submitted - rows.length`;
the result joins on `pathname` because `sourceKey` is deliberately not on `NinaAvatarRow`.

**`deleteNinaAvatarAction`** — row first, blob second, TWO `del()` targets in one call: the row
is the only record that the thumbnail object exists (its stored pathname carries Blob's random
suffix and is not derivable). The current photo cannot be removed — the query's WHERE refuses it,
which makes "zero current avatars" unreachable rather than repaired. A failed `del` logs and still
reports success: a recoverable orphan beats a permanently broken image under a live row.

**`listNinaAlbumManifestAction`** — every stored dedupe key under a folder subtree, called before
walking a drop so `planFolderUpload` has something to diff against. A Server Action (not a Route
Handler) because it runs once per drop and keeps `requireAdmin()` as the gate with no new `/api`
surface. `truncated` is `>=` and not `>`: a subtree holding exactly `NINA_ADMIN_MANIFEST_MAX`
(2000) reports truncated when it was not — the error is in the safe direction, and truncation is
survivable because a short manifest OVER-reports, the extra files are re-PUT, and their inserts
are discarded by `ON CONFLICT DO NOTHING`. Slower, never wrong.

### `chatPhotos.ts` / `chatPhotoSchema.ts` / `chatPhotoActions.ts` — the media collection

```ts
// chatPhotos.ts — the ceilings and the shapes
export const ADMIN_CHAT_PHOTOS_PATH = '/admin/nina'   // the collection lives in the explorer now
export const ADMIN_CHAT_PHOTO_PURPOSE = 'selfie'
export const ADMIN_CHAT_PHOTO_EXT = 'jpg'
export const ADMIN_CHAT_PHOTO_CONTENT_TYPE = 'image/jpeg'
export const ADMIN_CHAT_PHOTO_ID_RE = /^[A-Za-z0-9_-]{12}$/
export const ADMIN_CHAT_PHOTO_STORED_ID_RE = /^[A-Za-z0-9_-]{12}-[A-Za-z0-9_-]{16,64}$/
export const ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES = 2 * 1024 * 1024
export const ADMIN_CHAT_PHOTO_MAX_EDGE_PX = 12_000
export const ADMIN_CHAT_PHOTO_MAX_URL_CHARS = 2048
export const ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS = 2000
export function adminChatPhotoPathname(userId: string, id: string): string
export function isAdminChatPhotoPathname(pathname: string, userId: string): boolean
export function isHttpsBlobUrl(value: string): boolean
export function blobUrlMatchesPathname(blobUrl: string, pathname: string): boolean
export function isNinaPhotoCarrierMessage(message): boolean
export interface ChatPhotoActionResult { ok; error?; id?; description?; note? }
export interface ChatPhotoKeeper { … }   // the row a duplicate points at, incl. its own contentHash
export interface ChatPhotoAddPlan { … }  // what add writes, and the blob to release afterwards
export function planChatPhotoAddWrite(input): ChatPhotoAddPlan

// chatPhotoSchema.ts
export const chatPhotoAddSchema
export const chatPhotoReplaceSchema
export const chatPhotoRemoveSchema         // { id }
export const chatPhotoDescribeSchema       // { id }
export const chatPhotoDescriptionField     // .max(2000) then transform
export const chatPhotoDescriptionSchema    // { id, description }
export const chatPhotoSetAvatarSchema      // { id, scale, x, y } — adoption framing, all required

// chatPhotoActions.ts
export async function addChatPhotoAction(input): Promise<ChatPhotoActionResult>
export async function replaceChatPhotoAction(input): Promise<ChatPhotoActionResult>
export async function findChatPhotoDuplicateAction(contentHash, sourceHash?): Promise<{id, blobUrl, pathname} | null>
export async function removeChatPhotoAction(input): Promise<ChatPhotoActionResult>
export async function editChatPhotoDescriptionAction(input): Promise<ChatPhotoActionResult>
export async function describeChatPhotoAction(input): Promise<ChatPhotoActionResult>
```

**Write-time dedupe** (`planChatPhotoAddWrite` + `findChatPhotoDuplicateAction`, the
media-dedupe set): the browser pre-checks `findChatPhotoDuplicateAction(contentHash, sourceHash)`
before PUTting; the action re-checks by hash at write time. Three answers — `pinned` (the
client-named keeper, re-read owner-scoped at action time), `hit` (the race: fresh bytes PUT, a
concurrent original claimed them), or a new original with its hash claim. A duplicate row is a
REFERENCE (`source_avatar_id`/`source_image_id`) that copies the keeper's `blobUrl`/`pathname`
**and its `description`** (a second vision call over identical pixels is a second bill for a fact
already in hand), and the loser's fresh PUT is released after the row lands (ROW FIRST, BLOB
SECOND). A row's `content_hash` describes the bytes its `blob_url` serves — a reference carries
the KEEPER's measured hash, even when that is NULL, never the claim's.

**Remove** resolves the empty-bubble problem: when the last image on a message that exists only
to carry it goes, the MESSAGE goes too (in the same transaction — `message_id` is `ON DELETE SET
NULL` since the orphan work, so a deleted SESSION cannot take photographs with it; a
runner-authored carrier message is protected by `isNinaPhotoCarrierMessage`). Orphan rows
(`messageId` NULL — every photograph from every deleted conversation) take the plain branch. The
blob is released via `releaseBlobIfUnreferenced` — the same object may sit behind another row or
her current profile picture, and the shared case is reported in the result's `note`.

**Describe/prose**: `describeChatPhotoAction` is the on-demand vision pass (refuses reference
rows — describe the original instead; the token-floor error is logged LOUDLY, its own class of
incident). `editChatPhotoDescriptionAction` is the hand-written one: NO model call, NO
`after()`, no re-caption — **editing what she SAW is not editing what she SAID** — and an empty
box clears to NULL (D1: refusing empty would make a wrong description un-erasable).
`chatPhotoDescriptionField` caps the RAW string (`.max()`) BEFORE normalising (`.transform()`) —
a 4000-char paste is refused and reported, never sliced into range. No `.min(1)`: an
all-whitespace box normalises to `''` and parses clean — the schema hands that decision to the
action.

### `users.ts` — the unscoped read, behind the boundary

```ts
export interface AdminUserRow { id: string; name: string | null; email: string | null; slots: number; facts: number }
export async function listAdminUsers(): Promise<AdminUserRow[]>
export async function getAdminUser(userId: string): Promise<AdminUserRow | null>
```

`listAdminUsers()` is the one unscoped read in the app, and it lives here rather than in
`lib/db/queries.ts` on purpose: `scripts/check-data-layer-invariants.mjs` fails on any export
there whose first parameter is not `userId`, and a fifth exception would blunt the guard. The
unscoped read sits behind `requireAdmin()`. `::int` on the counts is load-bearing — Postgres
`count(*)` is `bigint`, which the Neon driver hands back as a string. Ordered by email.

### `tuningActions.ts` / `tuningModel.ts` — the character panel

One action: **`saveNinaTuningAction`** — `requireAdmin()` → Zod (`ninaTuningWriteSchema`) →
`writeNinaTuning` → `revalidatePath('/admin/personality')`, result object never a throw. The
reset action is gone (auto-save set); the defaults live server-side in `lib/nina/tuning.ts` and a
client that re-implemented them would be a second definition.

`tuningModel.ts` is the panel's client-safe half — the copy for every trait/dial/relationship
(`tuningCopy`, `relationshipCopy`), `toTuningDraft`, the unsaved-field diff (`changedTuningFields`,
`tuningDraftEquals`), `loudestDials`, `TUNING_DIAL_COMMIT_DEBOUNCE_MS` (600) and
`mergeTuningAfterSave` (a field still equal to what was dispatched takes the canonical value; a
field edited since keeps the newer local value). **It imports exactly one module —
`@/lib/nina/tuning` — and a test asserts that.** Values as well as types, which is safe because
`tuning.ts` is zero-import and its own test proves it. It carries no `server-only` pill (a client
component imports it); `memoryModel.ts` next door is stricter because its vocabulary lives behind
a pill.

**The tuning is not a memory slot, and the reason is structural.** The distiller may overwrite any
slot not marked `source: 'admin'`, so a tuning in `nina_memory_slots` is a character that could
eventually rewrite itself; and `/admin/memory`'s row builder would render twenty dials as
free-text prose. It gets its own table. `revalidatePath` re-renders the panel and is NOT how the
edit reaches Nina: the tuning is read live on every turn, no cache on that path.

### `memoryModel.ts` / `memoryVocab.ts` / `memoryStore.ts` / `memoryActions.ts` — `/admin/memory`

`memoryModel.ts` (zero value imports, client-safe): `ADMIN_FACT_TEXT_MAX` (400),
`ADMIN_SLOT_VALUE_MAX` (400), `ADMIN_LEDGER_PAGE` (200), the seven `ADMIN_FACT_CATEGORIES`
(retyped as a tuple with `satisfies` — `NinaFactCategory` is a type union, not a const tuple), and
**`MemoryRow`** — slots, ledger facts and `pending_promises` entries flattened into the one
serializable shape the table renders, with the fields that carry meaning (`editable`, `deletable`,
`reappears`, `note`). `reappears` is the honest-delete flag: only the closed vocabulary's slot
keys come back as blank rows, and the table has to say so or it reads as a failed delete.

`memoryVocab.ts` is the only file here that imports `lib/nina/memory.ts`, and only as a READER:
`slotEditKind`, `slotProtection`, `describeSlot`, `canonicaliseSlotValue` (the round trip runs on
the WRITER — a refused value is reported, not converted) and `buildMemoryRows`, the page's
server-side row builder.

`memoryStore.ts` — `server-only`, the only file naming a phase-1 memory writer
(`adminUpsertSlot`, `adminDeleteSlot`, `adminAppendFact`, `adminUpdateFact`, `adminDeleteFact`,
`adminReadSlot(s)`, `adminReadFacts`). It exists to make one invisible failure impossible: the
underlying writers would default `source` to the distiller's value when omitted, and the
admin-preservation ruling keys off that column — so `AdminFactDraft`/`AdminSlotDraft` simply have
no `source`/`sourceMessageId` field. A caller cannot mislabel a row because there is nowhere to
put the label. It is under `lib/admin/` (not `lib/nina/`) because a test asserts the distiller's
modules do not import the mutating ledger queries.

`memoryActions.ts` — **four** actions (`saveSlotAction`, `insertFactAction`, `editFactAction`,
`deleteMemoryRowAction`), each the same four lines: `requireAdmin()` first, Zod second, the write
through `memoryStore.ts` only, `revalidatePath` last. There were nine; the five that went were
each a second step (a quoting record before delete, a typed confirmation, a second button after a
refusal) and the owner has ruled: no confirmation whatsoever. Consequences worth recording:

- `editFactAction` edits ANY ledger row, including distilled ones: the edit sets
  `source = 'admin'`, `source_message_id = NULL` in the same statement, so the row stops claiming
  to be a quotation and the old permissions predicate had nothing left to decide. The row's note
  says the edit makes it his.
- `deleteMemoryRowAction` is the one destructive action and it destroys on the first click;
  `memoryDeleteSchema`'s union makes the three branches exhaustive. A **slot** row is gone but
  the KEY comes back blank (closed vocabulary); a **promise** entry leaves the slot and does not
  reappear unless the runner states it again; a **fact** is gone for good. No quoting record is
  written for any of the three — the record was the confirmation.
- The old "the append comes first, always" two-statement invariant is GONE, deliberately: no
  surviving action writes twice, and the invariant is removed rather than left as folklore.
- `revalidatePath` re-renders the page and is not how the edit reaches Nina — `loadNinaContext`
  reads both tables live every turn.

### `shortcutModel.ts` / `shortcutStore.ts` / `shortcutActions.ts` — `/admin/shortcuts`

```ts
// shortcutModel.ts — pure, client-safe
export { NINA_SHORTCUT_EXPANSION_MAX, NINA_SHORTCUT_LABEL_MAX, NINA_TRIGGER_MAX } from '@/lib/nina/shortcuts'
export const ADMIN_SHORTCUT_PAGE = 200
export const SHORTCUT_FIELDS = ['trigger', 'label', 'expansion'] as const
export type ShortcutField = (typeof SHORTCUT_FIELDS)[number]
export type AdminShortcutKind = NinaShortcutMatchable['kind']   // a TYPE read of phase 1's union
export interface ShortcutRow { … }  // id, trigger, matchKey, kind, label, expansion, enabled, uses, lastUsedAt, createdAt
export interface ShortcutSource { … }
export function buildShortcutRows(sources): ShortcutRow[]   // the one Date→ISO conversion
export function formatFired(uses, lastUsedAt): string       // 'never', not '0'

// shortcutStore.ts — 'server-only'
export interface AdminShortcutDraft { trigger: string; label: string; expansion: string }
export type AdminShortcutWrite = 'ok' | 'duplicate' | 'missing' | 'empty'
export async function adminCreateShortcut(userId, draft): Promise<AdminShortcutWrite>
export async function adminSaveShortcutField(userId, id, field, value): Promise<AdminShortcutWrite>
export async function adminSetShortcutEnabled(userId, id, enabled): Promise<'ok' | 'missing'>
export async function adminDeleteShortcut(userId, id): Promise<'ok' | 'missing'>
export async function adminReadShortcuts(userId, limit): Promise<ShortcutSource[]>

// shortcutActions.ts — 'use server'
export interface AdminShortcutResult { ok: boolean; error?: string; note?: string }
export async function addShortcutAction(input): Promise<AdminShortcutResult>
export async function saveShortcutCellAction(input): Promise<AdminShortcutResult>
export async function toggleShortcutAction(input): Promise<AdminShortcutResult>
export async function deleteShortcutAction(input): Promise<AdminShortcutResult>
```

The load-bearing facts (all still verified in source):

- **`shortcutModel.ts` is the one door, one file wide.** `ShortcutTable.tsx` names no
  `@/lib/nina/` specifier at all; the single re-export of the three caps is the only value import
  in the file, and `tests/admin.shortcuts.test.ts` asserts the boundary three ways. Otherwise it
  is `memoryModel.ts`'s value-import ban.
- **`shortcutStore.ts` reaches no table and derives nothing.** Every statement is
  `lib/nina/queries.ts`'s; `match_key`/`kind` are computed inside those writes and the patch types
  have no field for either; `classifyNinaTrigger` is not imported. The one `normalizeNinaTrigger`
  call is a QUESTION (does what he typed survive folding?), answered with `'empty'`.
- **A duplicate is caught, never checked for.** `(user_id, match_key)` is unique; a pre-flight
  SELECT races itself. `isUniqueViolation` (from `lib/db/queries.ts`) turns the 23505 into
  `'duplicate'`; when the Neon HTTP driver drops the constraint name, `nina_shortcuts_user_match_unq`
  is the only constraint a form here can reach.
- **The read is bare** — every row, disabled included (`{ onlyEnabled: true }` is the turn path's
  narrowing). Ordering (`createdAt DESC, id DESC`) and the ceiling are applied in this module, in
  memory, on a fresh copy — a row lands directly under the form that made it.
- **Four actions, no fifth; no confirmation anywhere.** `tests/admin.shortcuts.test.ts` asserts
  the absence of every second-click API by name. A successful delete returns no `note` — the row
  being gone is the message. The `'duplicate'` refusal quotes the trigger and says the folding
  out loud (`✌️` and `✌` fold to one key), because that is the most confusing five seconds this
  page can produce.

### `imageGenModel.ts` / `imageGenActions.ts` / `imageGenTestView.ts` — `/admin/image-generation`

Three actions, each opening with `await requireAdmin()`:

- **`saveNinaImagePrefsAction`** — the ONE save. Every control commits at its own moment and
  every commit carries the WHOLE draft (dial debounced 600 ms, focus checkboxes and reference on
  change, text fields on blur). The template's verdict is surfaced BEFORE the generic parse so the
  operator learns WHICH placeholder is broken. The success result carries `prefs: ImageGenDraft`
  — the row AFTER `coerceNinaImagePrefs` — adopted via `mergeImageGenAfterSave` without a
  refetch. `revalidatePath` is for the preview; there is no cache on the image path.
- **`runNinaImageTestAction`** — spends one generation, takes NO arguments (everything it needs
  is the saved row and the admin identity, so there is no shape to forge), returns
  `{ ok, jobId, quotaLeft }` without waiting (a test runs 78–235 s; the daily cap
  `NINA_IMAGE_DAILY_CAP`, default 30, counts failures too). No `revalidatePath` — nothing has
  landed.
- **`readNinaImageTestAction(jobId)`** — the id is a CLAIM turned into a fact by `isValidId`
  plus an owner-scoped read. Returns the live quota, the prompt preview assembled from the SAVED
  prefs, the saved reference URL, and the job view.

`imageGenModel.ts` is the panel's pure half (draft, copy, `referenceKey`/`parseReferenceKey` —
the picker seam is an opaque `${source}:${id}` string, never a Blob URL, because
`updateNinaChatPhotoBlob` swaps a photo's `blob_url` while keeping its `id`; `reference.id` is
`''` for none, never `null` — a `.min(1).nullable()` spelling once rejected the default state at
the boundary). `imageGenTestView.ts` is the verdict lookup: `refused` is reachable from
`error_code === 'policy'` and nothing else; `timeout`/`transport`/`stale` are `inconclusive`
(NOT refusals — telling the operator his prompt was banned when the network dropped would send
him rewriting a prompt that was fine); the pending phase (not the `attempts` counter) separates
`running` from `retrying`, because the claim bumps `attempts` in the same statement that starts
the attempt (measured in production 2026-09-11). Poll schedule 3 s/5 s/8 s by band;
`NINA_IMAGE_TEST_GIVE_UP_MS` = 480 s — derived (two attempts × 235 s + margin) and deliberately
thinner than the server's twenty-minute stale deadline; its expiry says STILL OPEN, not failed.

### `textModelActions.ts` — the narrative text model

One action: **`saveNarrativeTextModelAction({ model })`** — `requireAdmin()` →
`z.enum(NARRATIVE_TEXT_MODEL_IDS)` (from `@/lib/llm/catalog`) → `writeNarrativeTextModel`
(`app_settings`, not `nina_tuning`) → `revalidatePath('/admin/personality')`. A second action
FILE, not a fourth export on `tuningActions.ts`: that file's structural test pins it to one
export, the tuning is one row, and this is a different store with a different blast radius (every
text call in the app). There is no cache on the resolution path — `narrativeModel()` reads the
row live, so the write is live on the next call; the revalidation is for the page's select.

### `shareToNina.ts` — the album→chat pointer

```ts
export function ninaPhotoShareUrl(origin: string, avatarId: string): string
```

One function, and the whole pointer: `/nina?photo=avatar:<id>`, built with `new URL` (which
percent-encodes the `:` and throws on a malformed origin — the right failures). The formatter is
imported from `lib/nina/attach` (`formatNinaPhotoParam`/`PHOTO_PARAM`) rather than inlined, so
the writing half (`/admin`) and the parsing half (`/nina`) cannot disagree about the grammar. No
bytes move and no blob is copied; `sendNinaMessage`'s `resolveAttachment` turns the id back into
a row, owner-scoped, when the message is actually sent. The `origin` argument is
`shareOrigin()`'s output, never `window.location.origin`.

### `errorLogModel.ts` — `/admin/error-logs`' pure half

```ts
export const ADMIN_ERROR_LOGS_PATH = '/admin/error-logs'
export const ADMIN_ERROR_LOG_PAGE_SIZE = 25        // = the reader's clamp ceiling, on purpose
export const ADMIN_ERROR_LOG_PAGE_CEILING = 1000   // a hand-typed ?page= cannot ask for an offset no log reaches
export const ADMIN_ERROR_CATEGORIES = ['text', 'multimodal', 'image_generation'] as const
export type AdminErrorCategory = (typeof ADMIN_ERROR_CATEGORIES)[number]
export const ADMIN_ERROR_CATEGORY_LABEL: Record<AdminErrorCategory, string>
export function readErrorCategory(raw: string | string[] | undefined): AdminErrorCategory  // first value; unknown → 'text'
export function readErrorLogPage(raw: string | string[] | undefined): number               // 1-based, floored at 1, capped
export function errorLogHref(category, page): string   // the default is the ABSENCE of the parameter
export interface ErrorLogSource { … }   // the eight rendered columns — STRUCTURAL, not imported
export interface ErrorLogListItem { … } // id, stamp, stampISO, provider, model, fullInput, errorText, imageUrl
export function formatErrorLogStamp(at: Date): string              // '12/09 07:31', Asia/Jakarta, no year
export function formatErrorTimeout(timeoutMs: number | null): string | null  // 300000 → '300s'
export function composeErrorText(errorMessage, timeoutMs): string  // the timeout is the error text's FIRST line
export function toErrorLogListItem(row: ErrorLogSource): ErrorLogListItem
export function buildErrorLogItems(rows): ErrorLogListItem[]       // maps, never sorts
```

Load-bearing facts:

- **The file has no import statement at all — not even a type.** Its client consumer
  (`components/admin/ErrorLogList.tsx`, `'use client'`) imports it, and the row type's real home
  `lib/nina/errorlogs.ts` imports `@/lib/db` — so `ErrorLogSource` is DECLARED here, structurally,
  naming the eight columns the page renders. A `NinaErrorLog` satisfies it, so the reader's rows
  pass into `buildErrorLogItems` with no adapter, and `lib/nina/errorlogs` stays named by exactly
  one file on the server side of the bundle line: the page. `filetree.ts` is this rule's precedent.
  **Unlike `shortcutModel.ts`'s one-door boundary, this one has no import-list assertion** — what
  guards it today is the module header and the page-size pin's dynamic import (below), which is
  why the dynamic import is load-bearing and not a style choice.
- **`ADMIN_ERROR_LOG_PAGE_SIZE` duplicates the reader's ceiling deliberately.** The page reads
  `nina_error_logs` ONLY through Phase 1's `listNinaErrorLogs(category, { limit, offset })` →
  `{ rows, total }` — no `userId` argument (the read is an operator's cross-user diagnostic, and
  two of the three writers store `user_id` NULL by design), no SELECT of its own. The reader
  CLAMPS `limit` to `NINA_ERROR_LOG_PAGE_SIZE` (25), so a larger page size would render 25 rows
  while advancing the offset further — silently skipping every row in between. If the page size
  ever changes, the reader's ceiling moves first; a test pins
  `ADMIN_ERROR_LOG_PAGE_SIZE <= NINA_ERROR_LOG_PAGE_SIZE`, importing the reader DYNAMICALLY so the
  module under test keeps its import graph clean.
- **The timestamp is formatted on the server, in Jakarta.** A log row is an instant, not a
  calendar day, so it does not go through `jakartaDayOf` — but one operator in one timezone reads
  it, and a client-side `toLocaleString()` would render two strings for one row. The formatter is
  module-level (one `Intl.DateTimeFormat`, not one per row) and `en-GB` for what it buys, not as a
  preference: `dd/mm` and an h23 hour cycle (`00:00`, never some ICU build's `24:00`). Eleven
  characters, no year; every item crosses the RSC boundary as a finished string.
- **The timeout is folded into the error text, first.** `composeErrorText` puts `Timeout: 300s` on
  top of the raw provider error — a provider error can be a kilobyte of HTML, and the number the
  operator came for must not sit at the bottom of a scroll. Seconds, because that is the unit the
  requirement was written in; `null` (and no line at all) for anything that is not a positive
  finite number of milliseconds.
- `buildErrorLogItems` maps and never sorts — the reader's SQL already ordered newest-first.
  `errorLogHref` spells every link INTO the page (tab strip and pager share it), with Text and
  page 1 as the ABSENCE of a parameter, so the canonical URL and a navigated-back-to first page
  are the same URL.

## Internal Architecture

### Data flow — a folder upload, end to end

```
browser: drop / picker
   │
   ├─ listNinaAlbumManifestAction({ folder })      ← requireAdmin, once per drop
   │      → { id, folder, sourceKey }[] (+ truncated)
   │
   ├─ planFolderUpload({ base, files, manifest, maxBytes })   ← pure, in the browser
   │      → upload[] / existing[] / rejected[] / refused[] / folders[] / counts
   │
   ├─ for each planned file, in PARALLEL under a bounded queue:
   │      POST /api/admin/nina/upload   ← requireAdminApi, mints a signed token
   │        · nina/<uid>/avatar-<id>.<ext>  → 8 MB cap
   │        · nina/<uid>/thumb-<id>.<ext>   → 512 KB cap
   │      PUT bytes straight to Blob (never through the Function)
   │
   └─ in CHUNKS of NINA_ADMIN_BATCH_MAX (50), SERIALLY:
          registerNinaAvatarsAction({ records })   ← requireAdmin
             1. Zod: avatarBatchRegisterSchema (all-or-nothing)
             2. intra-batch dedupe on sourceKey, first writer wins
             3. one read: does a current avatar exist?
             4. declareNinaFolders(uid, [...new Set(folders)])   ← BEFORE the insert
             5. insertNinaAvatars — ON CONFLICT (user_id, source_key) DO NOTHING
             6. if there was no current row, promote one + scheduleDescribe (after())
             7. revalidatePath('/admin/nina')
             → { inserted: [{ sourceKey, id }], skipped }
```

The vision model appears nowhere on that path. It runs when a photo becomes her face, is handed
to her, is described on demand — and then either in-band (the two describe actions) or inside
`after()` (the two private schedulers).

### Where each check lives, and why it lives there

| Concern | Client (`filetree.ts`/`folderOps.ts`) | Route Handler | Server Action |
|---|---|---|---|
| Path normalisation | yes — the mess is here | — | **never** (refuse instead) |
| Path validity | yes | — | yes, as identity against the normaliser |
| Filename / extension | yes | extension vs. declared content type | yes |
| Byte cap | yes (`maxBytes` arg) | enforced by the minted token | yes (`bytes` field) |
| Dedupe | yes, against the manifest | — | intra-batch, then the unique index |
| Folder-op geometry (cycle, merge, depth) | yes (`folderOps` planners) | — | re-checked with the LIVE folder list |
| Current-photo protection | refusal text (`currentPhotoRefusal`) | — | SQL `isCurrent = false` in every delete's WHERE |
| Authorization | — | `requireAdminApi` (401/404) | `requireAdmin` (redirect/404) |
| Crop range | — | — | Zod shape, then `clampCrop` |

## Dependencies

### External

- `zod` — `schema.ts`, `folderOps.ts`, `chatPhotoSchema.ts`, `textModelActions.ts`.
- `@vercel/blob` — `del()` in `ninaAlbumActions.ts` and the media remove path.
- `drizzle-orm` — `users.ts` only (`asc`, `eq`, `sql`).
- `next/cache`, `next/navigation`, `next/server` — `revalidatePath`, `redirect`/`notFound`, `after`.
- `server-only` — the pill on exactly `requireAdmin.ts`, `users.ts`, `memoryStore.ts`,
  `shortcutStore.ts` (the others that mention the pill in prose are client-imported and carry none).

### Internal

- `@/auth`, `@/lib/env` — the boundary's inputs (`isAdminEmail`, `blobEnv` at the route).
- `@/lib/auth/requireUserId` — `UnauthorizedError`, imported rather than redefined.
- `@/lib/nina/queries` — every album, chat-photo, memory and shortcut read/write; the four
  shortcut writes are named in `shortcutStore.ts` and nowhere else under `lib/admin` (a test
  asserts it).
- `@/lib/nina/{crop,album,images,vision,caption,memory,shortcuts,attach}` — clamp/bounds, batch
  and manifest caps, the blob prefix, the two model-call families (`describeNinaImages`,
  `captionNinaPhoto`), the slot vocabulary read, the trigger caps and normaliser, the
  photo-param grammar.
- `@/lib/nina/{imageprefs,imagerecipe,imagetest,imagejobs,imagefail,jobview,sessionResolve,blobRelease}`
  — the image-generation row's bounds and template validator, the daily cap, the test dispatch,
  job reads, the failure-kind vocabulary the test view looks up, the carrier/orphan rules, the
  blob release on remove.
- `@/lib/llm/{catalog,textModel}` — the narrative text model's id list and its store
  (`textModelActions.ts` only).
- `@/lib/photos/contentHash` — the dedupe hash (`chatPhotoActions.ts`).
- `@/lib/id` — `isValidId` shape checks on claimed ids.
- `@/lib/db`, `@/lib/db/schema`, `@/lib/db/queries` — `users.ts` and the memory type imports;
  `isUniqueViolation` (shortcuts' 23505 catch).

`filetree.ts` and `errorLogModel.ts` import **nothing** — the latter not even a type, which is
why `ErrorLogSource` is declared structurally (see its section).

## Reverse Dependencies

Import-site census (`grep "from '@/lib/admin/<m>'"` over `app/ components/ lib/ tests/`;
measured 2026-09-12 — counts include co-located tests and `vi.mock` factories, and exclude
`.workflows/` plan copies):

| Module | Importers | Module | Importers |
|---|---|---|---|
| `filetree` | 17 | `chatPhotoSchema` | 5 |
| `requireAdmin` | 15 | `imageGenTestView` | 4 |
| `schema` | 10 | `imageGenActions` | 4 |
| `ninaAlbumActions` | 10 | `chatPhotoActions` | 4 |
| `chatPhotos` | 10 | `errorLogModel` | 4 |
| `avatars` | 8 | `memoryVocab` | 3 |
| `tuningModel` / `shortcutModel` / `imageGenModel` | 7 each | everything else | ≤2 each |
| `memoryModel` | 6 | | |
| `users` | 5 | | |

Named primary consumers:

- `components/admin/FileExplorer.tsx` + `explorer/{FolderTree,UploadQueue,useFolderUpload,dropWalk,model,PhotoGrid,SelectionPane,MediaPane,MediaAdd,MediaControls,PhotoDescription,chatPhotoUpload,thumbnail}` — the client half: `filetree`'s pure surface, the `avatars`/`chatPhotos` bounds, and the six media actions.
- `components/admin/{FolderMenu,PhotoMoveBar,ShareToNinaItem}.tsx` — folder maintenance, bulk
  move/remove, and the share link (`shareToNina.ts`).
- `app/api/admin/nina/upload/route.ts` — the whole `avatars.ts` surface plus `requireAdminApi`,
  `forbiddenJson`, `AdminIdentity`, and the `chatPhotos` pathname/ceiling vocabulary.
- `app/admin/nina/page.tsx` — `requireAdmin`, `filetree` (`readExplorerView`), `ninaAlbumActions`.
- `app/admin/{memory,shortcuts,personality,image-generation}/page.tsx` — their module groups as
  in the map above, plus `users.ts`' pickers.
- `app/admin/error-logs/page.tsx` — `requireAdmin` as its first statement (nothing destructured
  off it: the read is deliberately not user-scoped), `errorLogModel`'s URL grammar and row→prop
  mapping, and the one `@/lib/nina/errorlogs` import — which is what keeps that reader on the
  server side of the bundle line.
- `components/admin/{ErrorLogList,LogTextDialog}.tsx` — the compact one-row-per-entry list
  (`min-w-0 truncate` on the half that gives, `shrink-0` on the icon group; client state is which
  text is in the popup and which photo the `PhotoViewer` shows) and the read-only native
  `<dialog>` over props.
- `lib/admin/folderOps.ts` → imported by `ninaAlbumActions.ts` (the folder actions call the
  planners); `lib/admin/schema.ts` imports `chatPhotoSchema.ts`.
- `components/admin/{TextModelSelect,ImageGenTestPanel,ImageGenPanel,CharacterPanel,ShortcutTable,MemoryTable}.tsx` — their action/model pairs.

Test consumers — every suite under `tests/` whose name starts `admin.` (24 files:
`admin.avatars`, `admin.filetree`, `admin.folderOps`, `admin.albumAvatarActions`,
`admin.chatPhotos`, `admin.chatPhotoDedupe`, `admin.chatPhotoAdoption`, `admin.memory`,
`admin.memoryActions`, `admin.tuning`, `admin.shortcuts`, `admin.shortcutActions`,
`admin.imagegen`, `admin.imageGenActions`, `admin.imagegenTest`, `admin.photoGrid`,
`admin.photoReference`, `admin.mediaPane`, `admin.requireAdmin`, `admin.settingsActions`,
`admin.shareToNina`, `admin.shell`, `admin.users`, `env.admin`), plus the co-located
`components/admin/**/*.test.tsx` suites and — since 2026-09-12 — a co-located suite inside this
package itself (`lib/admin/errorLogModel.test.ts`, beside its module; the co-located suites grew
by three that day: it plus `ErrorLogList.test.tsx` and `LogTextDialog.test.tsx`), many of which
reach `lib/admin` through `vi.mock` factories — a factory's export list is a real dependency: it
must name every export the component imports. `tests/admin.shell.test.ts` is the one that pins
the admin bar's GEOMETRY against the layout's clearance, and it counts the nav's cells by reading
`AdminNavLinks.tsx`'s source — see the gotcha before touching that bar. This readme deliberately
carries no per-suite test counts; they rot within a week. Ask the suite.

## Concurrency

No thread primitives; the relevant facts are the runtime's:

- **Server Actions are dispatched one at a time per client.** That is why the folder register
  batches instead of calling per file, and why the parallel work (blob PUTs) goes through a Route
  Handler.
- **`after()`** defers both private schedulers (`scheduleDescribe`, `scheduleChatPhotoCaption`)
  until the response is finished. Nothing awaits them, nothing in them revalidates, every failure
  is swallowed and logged.
- **Races are settled by Postgres, not by application code.** `(user_id, source_key)` unique +
  `ON CONFLICT DO NOTHING` makes two tabs submitting the same batch idempotent;
  `nina_avatars_user_current_unq` (partial unique) means the un-current/current ordering is owned
  by `setCurrentNinaAvatar` and nothing here; `(user_id, match_key)` unique + 23505 catch decides
  shortcut duplicates. The chat-photo add path closes its race the same way: the client pre-check
  is an optimisation, the hash lookup at write time is the decision.
- The pure modules (`filetree.ts`, `avatars.ts`, `folderOps.ts`, `schema.ts`, `chatPhotos.ts`,
  `chatPhotoSchema.ts`, `memoryModel.ts`, `shortcutModel.ts`, `imageGenModel.ts`,
  `imageGenTestView.ts`, `shareToNina.ts`, `errorLogModel.ts`) hold no state.
  `NINA_FOLDER_FORBIDDEN_RE` has no `g` flag specifically so sharing one regex object across
  callers is safe; `errorLogModel.ts`'s one shared object, the module-level
  `Intl.DateTimeFormat`, is likewise safe to share and exists so a row never constructs one.

## Error Handling

- **Actions return, they do not throw.** Every action returns a result object, so the client has
  one branch and no `unknown`. Error strings are operator-readable sentences.
- **The page boundary throws framework control flow** (`redirect()`/`notFound()`); the API
  boundary throws typed errors (`UnauthorizedError` 401, `AdminForbiddenError` 404) so one catch
  serves both.
- **Vendor and blob failures are non-fatal and logged** (with distinct log levels for "the vendor
  answered 200 and dropped the image" — the token floor — versus a dead socket).
- **A failed `del` still reports success** after logging: the row is already gone, and a
  recoverable orphan beats a broken image under a live row. The orphan window is named, not
  fixed — the blob reaper owns it, deliberately out of scope here.
- **Refusals are sentences, not field errors**, wherever the sentence is the product: the folder
  merge refusal names both paths and offers the explicit alternative; the current-photo refusal
  names the photo and both ways out.

## Performance

- **The describe pre-pass is off the hot path** (~8–11 s per call; promotion, share, or on demand
  only). The image TEST is the one long operation on a response path, and it is split into
  dispatch (returns immediately) and poll.
- **One read per batch, not one per file** (current-row lookup, folder declaration).
- **The thumbnail is the grid's whole performance story** (a derived 256 px blob beside each
  original; `next/image` transforms on Blob cost paid quota).
- `planFolderUpload` is O(files) with two `Set`s; `folderCounts`/`buildTree` are single passes;
  `planRelocation` is one pass over the folder list. A folder rename writes N rows and copies
  zero bytes.
- **`/admin/error-logs` ships its payload up front, bounded.** The list carries the FULL input and
  the FULL error text with every row, because the popup is a dialog over props rather than a
  second round trip; the payload's ceiling is the reader's own arithmetic — 25 rows × the
  64,000-character per-column clamp — and the dialog renders nothing while shut.
- Benchmark coverage: none. The unit suites are correctness suites.

## Usage

### The one-line rule

```ts
export default async function Page() {
  const { userId } = await requireAdmin()      // always line 1
  const album = await listNinaAvatars(userId)  // always scoped
}
```

### Gotchas

- **Do not add an import to `filetree.ts`.** Not even for the byte cap — that is what the
  `maxBytes` parameter is for. One server-side import and the client explorer stops compiling.
- **Do not make `folderPathSchema` normalise.** It validates a canonical path; a server-side
  rewrite is the invisible-corruption failure the identity check exists to prevent.
- **Do not re-spell a bound in `schema.ts`.** Every one is imported.
- **Do not put a describe call on a register path.** It was there, it was measured, it was moved.
- **Do not re-caption after a hand-written edit** — `editChatPhotoDescriptionAction`,
  `editNinaAvatarDescriptionAction`. A hand-written description exists to override the vision
  pass; re-captioning the bubble rewrites a sentence Nina already said.
- **Keep `.max()` ahead of `.transform()`** in `chatPhotoDescriptionField`, and do not add
  `.min(1)` — the empty box is the clear (D1).
- **Do not delete a photo's row without considering both blob references and shared objects** —
  the row is the only record a thumbnail exists, and `releaseBlobIfUnreferenced` decides the
  release.
- **`declareNinaFolders` goes before the insert**, once per batch.
- **Do not reintroduce a singular register action.** A second insert path is how two paths end up
  disagreeing about the partial unique index.
- **Do not derive `match_key` or `kind` in `shortcutStore.ts`,** do not add a pre-flight SELECT,
  do not narrow the read to enabled rows, do not add a value import to `shortcutModel.ts`, and do
  not add a confirmation step to any shortcut action — the test asserts the absence of every
  second-click API by name.
- **Do not add a confirmation to a memory action either.** Four actions, first-click deletes, and
  `editFactAction` making a row his IS the data-integrity answer (the row stops claiming to quote
  its source message).
- **Do not "fix" the manifest `truncated` `>=`.** The error is in the safe direction and the
  cheap fix would need a second `COUNT(*)`.
- **Do not read `attempts` alone as "a retry happened"** in the image test view — the claim
  increments it when an attempt STARTS. The phase discriminates.
- **Do not widen the media dedupe to trust a claim's hash on a reference row.** A row's
  `content_hash` describes the bytes its `blob_url` serves — the keeper's own measured hash wins.
- **Renaming a folder onto an occupied path must stay refused.** A merge of the folder column is
  the one operation here with no inverse.
- **Do not add an import to `errorLogModel.ts` — not even a type.** The `'use client'` list
  imports it; `lib/nina/errorlogs.ts` imports `@/lib/db`. `ErrorLogSource` is declared
  structurally so the browser bundle names no database module. There is no import-list assertion
  on this file (unlike `shortcutModel.ts`), so the discipline is on the reader: anything this
  module needs from `lib/nina` crosses as an argument or arrives through a dynamically imported
  test-only read, never through the module's own import graph.
- **Do not raise `ADMIN_ERROR_LOG_PAGE_SIZE` past the reader's clamp.** `listNinaErrorLogs`
  CLAMPS `limit` to `NINA_ERROR_LOG_PAGE_SIZE` (25), so a bigger page size renders fewer rows
  than the offset advances by and silently skips everything in between — nothing errors. The
  reader's ceiling moves first; a test pins the inequality by importing the reader dynamically.
- **The admin bar's cell count is pinned in THREE places that must move together**:
  `components/admin/AdminNavLinks.tsx` (the `LINKS` array and its `grid-cols-<n>` row), its
  co-located test (renders the bar and counts cells, glyphs and accessible names), and
  `tests/admin.shell.test.ts` (counts the `short:` entries in the source and asserts the grid
  has a cell per route, against the layout's clearance). Add the route to all three or the
  shell's geometry guard fails — which is the point.

## Notes

Known, filed limitations: lexicographic rather than natural folder sort; `truncated`
over-reports at exactly the manifest cap; empty directories in a dropped tree are invisible to
the browser and so never survive an upload; the orphaned-blob window (blob PUT and never
registered) is real and belongs to the reaper, not to this package.

## Recent Changes

- **2026-09-12** — `nina-llm-fallback-error-logs` phase 5 (P1-ADM-A002): added
  `errorLogModel.ts`, `/admin/error-logs`' pure half — zero imports, a structural
  `ErrorLogSource` (the bundle-boundary rule), the Asia/Jakarta server-side stamp, the timeout
  folded into the error text, and `ADMIN_ERROR_LOG_PAGE_SIZE` deliberately equal to the reader's
  clamp ceiling `NINA_ERROR_LOG_PAGE_SIZE`, pinned by a test that imports the reader dynamically.
  The admin bar grew its seventh cell (Error logs, `/admin/error-logs`), a count pinned in three
  files together (`AdminNavLinks.tsx`, `AdminNavLinks.test.tsx`, `tests/admin.shell.test.ts`).
  Phases 2–4 of that plan set (the OpenRouter fallback writer code) are peer phases still in
  flight in the same worktree and are deliberately not documented here.
- **2026-09-12** — full compaction/verification pass (token-maxxing session
  `pkg-readme-lib-admin`, worker branch `token-maxxing-2026-09-12-pkg-readme-lib-admin`): every
  export block, signature, constant, dependency and reverse dependency re-verified against the
  tree; the module map completed (added `folderOps`, `imageGenModel`, `imageGenActions`,
  `imageGenTestView`, `textModelActions`, `shareToNina`); sections for deleted mechanisms
  removed (the eight-action memory era, `resetNinaTuningAction`, the `/admin/photos` route, the
  four retired memory schemas, the "append comes first" invariant, the stale
  `AdminManifest*`/`FolderUploadPlan` export lines left by the 2026-09-11 dead-exports sweep);
  new material documented (folder maintenance, media-view switch, write-time dedupe, chat-photo
  adoption, the text-model action, the image-test verdict view). Per-task history now lives in
  `git log -- lib/admin` — this file stopped carrying the inline changelog that kept re-loading
  ~160 lines of merged history into every context that opened it.
