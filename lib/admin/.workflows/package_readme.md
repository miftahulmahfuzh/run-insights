# Package: admin

**Location**: `lib/admin`
**Last Updated**: 2026-09-17 (the media collection joins the search — merged album+media ranking,
the Media describe/embed pipeline, keyword actions, promotion-as-a-link and the deletion guard,
P2-NIN-A002, phase 2 of 4 of `MEDIA_ALBUM_UNIFIED_SEARCH_PLAN.md`).
Previously: 2026-09-16 (the Reminders group on `/admin/memory` — full add/edit/delete over
the `reminders` slot, P1-ADM-R6XQ, phase 2 of 2 of `NINA_NATURAL_REMINDERS_PLAN.md`).
Previously: 2026-09-15 (`search_keywords` — the album's second embedding input — plus the
`nina:backfill-embeddings` script, P1-ADM-T8RM; same day, the album's describe-and-embed write side
+ the backfill route, P2-ADM-A001, and cross-table duplicate detection on the admin upload routes,
P1-ADM-L2VN).
Previously: 2026-09-14 (media add's push notification, P1-ADM-A003). Baseline:
2026-09-12 — full rewrite/compaction against the current tree (every export
block, signature, constant and reverse dependency re-verified mechanically; the per-task changelog
this file used to carry inline now lives in `git log -- lib/admin`, see *Recent Changes*).

## Overview

`lib/admin` is everything behind `/admin/**`: the authorization boundary itself, the admin
surfaces' Server Actions, the Zod schemas that validate every byte those actions accept from a
browser, and the pure planning libraries (`filetree.ts`, `folderOps.ts`) that decide — without a
database — what a folder upload or a folder maintenance operation is allowed to do. (`filetree`
is a directory of pure modules behind the `filetree.ts` re-export barrel since 2026-09-12.)

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
- Since 2026-09-15, own the rule that **an album row's vector and every input to it move together**:
  `description_embedding` is derived from `description` **and** `search_keywords`, so every path in
  this package that writes either one also writes (or deliberately NULLs) the vector, in the same
  statement, and the backlog is drained by a route this package owns. The two inputs have two
  writers (`editNinaAvatarDescriptionAction`, `editNinaAvatarSearchKeywordsAction`) and two
  one-statement queries on purpose — see the gotcha; neither writer can reach the other's column.
- Since 2026-09-15, own the rule that **a re-describe must never touch `search_keywords`**. The
  keywords are the operator's correction of exactly the model's opinion; a pass that cleared them
  would erase the correction every time it was needed.
- Since 2026-09-17, own the same rule **one table over**: `nina_message_images` now carries
  `description_embedding`, `search_keywords` and `negative_search_keywords`, so every media path
  that writes prose or keywords also decides about the vector in the same statement, and
  `ninaMediaDeferredDescribe.ts` is that table's single choke point for what a vector is computed
  FROM. The two pipelines are siblings, never one parameterised worker — the fork is a *witness*
  (`photoSideOf(kind)` here, hard-coded `'hers'` there), not a table name.
- Since 2026-09-17, own the rule that **promotion links, it never copies**.
  `setChatPhotoAsAvatarAction` inserts a `nina_avatars` row carrying the media row's own
  `blob_url`/`pathname` plus `source_image_id` — no `fetch`, no `put`, no second Blob object, no
  second copy of the prose. A pointer row's `description`, `search_keywords`,
  `negative_search_keywords` and `description_embedding` are **permanently NULL**: the four album
  prose/keyword actions redirect their writes to the linked media row, which is what makes "edit in
  one place, it changes everywhere" true by construction rather than by a sync mechanism.
- Since 2026-09-17, own **both halves of the guard that a link needs**: `deleteNinaAvatarAction`
  releases no blob at all for a pointer (it never owned the object), and `removeChatPhotoAction`
  REFUSES — with a sentence naming the fix — while an album pointer still names the media row.
  Neither cascades and neither silently orphans; the `ON DELETE RESTRICT` FK is the backstop for
  the race the read cannot close.
- Own the media collection's write side: add (with write-time dedupe, and the push notification
  that tells his phone either that the bubble exists or that the photograph was already in the
  collection), replace, remove (with blob release), describe, and the hand-written description
  edit.
- **Tell the operator when an upload's bytes are already somewhere in the collection — and never
  let that answer change what lands.** Every admin upload route (media add, media replace, the
  album folder batch) asks the cross-table duplicate question AFTER its row is committed. Nothing
  here skips a write, repoints a row or releases a blob because of the answer; the answer only
  chooses which push is sent.
- Own `/admin/memory`'s write side (six actions since 2026-09-16), and make it structurally
  impossible to write a memory row without the `admin` source label.
- Since 2026-09-16, own the admin half of Nina's **reminders** — add, edit and delete over the
  `reminders` slot that used to be reachable only by asking her in chat. The rule that came with
  it: this package supplies the *surface*, never a second copy of the rules. Create and delete go
  through phase 1's `applyReminderWrites` / slot shape in `lib/nina/reminders.ts`; the one thing
  the admin path has of its own is `patchReminder`, an in-place edit the chat path cannot express.
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
| `avatars.ts` | pure | Album blob pathname shapes, content types, size caps, id regex, TTLs — original and thumbnail — and the hand-written keyword field's character cap. |
| `filetree.ts` + `filetree/` | pure, **import-pure** (`./` siblings only) | Folder-path grammar (`pathGrammar`), file classification (`classify`), dedupe key (`sourceKey`), `planFolderUpload` (`uploadPlan`), tree building (`folderTree`), the explorer's album/Media view switch (`mediaView`), the limits (`bounds`). `filetree.ts` is the re-export barrel. |
| `folderOps.ts` | pure (zod) | Folder *maintenance*: the six operations' schemas and the planners that refuse without a database. |
| `schema.ts` | pure | Every Zod schema `/admin/**` accepts. Imports every bound; declares none. |
| `ninaAlbumActions.ts` | barrel (plain ESM) + `AdminActionResult`, `AdminSearchHit`, `AdminSearchResult`, `AdminSearchMode` | The album's write side: 16 actions — describe/edit prose, edit search keywords, face, crop, delete, folder register/manifest, folder maintenance. Since the `nina-queries-split` session the implementations live behind it in `ninaAlbumDescribeActions.ts`, `ninaAlbumAvatarActions.ts`, `ninaAlbumUploadActions.ts` (register + manifest), `ninaAlbumFolderActions.ts` and the plain `ninaAlbumDeferredDescribe.ts`; every importer still names the barrel. Since 2026-09-15 it also declares the album search's result types beside `AdminActionResult` — a `'use server'` module may not export a type at all. |
| `ninaAlbumDeferredDescribe.ts` | plain server module (no `'use server'`, no pill) | The deferred describe-**and-embed** pre-pass: the three `after()` schedulers, the lane worker, the wall-clock budget, and `embedNinaAvatarDescription` — the one choke point that turns a row's `(description, searchKeywords)` pair into a vector, via `lib/nina/avatarEmbedText.ts`. A synchronous scheduler cannot be exported from a `'use server'` module, which is why it has a file of its own. |
| `ninaAlbumSearchSchema.ts` | pure (zod) | The album search's payload: the typed-query ceiling, the data-URI ceiling and allow-list, and the one cross-field rule (a search with neither arm is not a search). Its own file, like `chatPhotoSchema.ts`. |
| `ninaAlbumSearchActions.ts` | `'use server'` | The READ side, and the layer's only read action: one `searchNinaAvatarsAction` covering text, image and both. Since 2026-09-17 it ranks **album AND media** into one list (the name is unchanged, the scope is not). Writes nothing, stores nothing, revalidates nothing. |
| `chatPhotos.ts` | pure | The media collection's vocabulary: pathname shapes, ceilings, id regexes, the carrier-message rule, `planChatPhotoAddWrite`'s types. |
| `chatPhotoSchema.ts` | pure | Every Zod schema the media collection accepts. Separate from `schema.ts` (different table, different route). `schema.ts` imports from it. |
| `chatPhotoActions.ts` | `'use server'` | Six actions: add (the only one that mints a message), replace, find-duplicate, remove, describe, edit description. Add and replace are the two that push; the other four mint nothing and notify nothing. Since 2026-09-17 describe and edit-description also write the vector, and remove carries the album-pointer refusal. |
| `chatPhotoKeywordActions.ts` | `'use server'` | The media collection's KEYWORD half (2026-09-17): `editNinaMessageImageSearchKeywordsAction` and `editNinaMessageImageNegativeSearchKeywordsAction`, and nothing else. Its own file for the reason the album side split `ninaAlbumDescribeActions.ts` off `ninaAlbumAvatarActions.ts` — `chatPhotoActions.ts` is already four seams wide. |
| `ninaMediaDeferredDescribe.ts` | plain server module (no `'use server'`, no pill) | The MEDIA twin of `ninaAlbumDeferredDescribe.ts` (2026-09-17): `embedNinaMessageImageDescription` — the one place that decides what a media row's vector is computed FROM — the two `after()` schedulers, the lane worker and the budget. A sibling module rather than a `kind` parameter; see its section. |
| `users.ts` | `server-only` | The unscoped account enumeration the memory page's picker (and others) need. |
| `memoryModel.ts` | pure | Memory bounds (including the two reminder caps), the seven categories, and `MemoryRow` — the one row model of `/admin/memory`. |
| `memoryVocab.ts` | `server-only` in practice (no pill; a test imports it) | The bridge from the closed slot vocabulary to the page's rows: `buildMemoryRows` (slots, orphans, reminders, promises, facts), `canonicaliseSlotValue`. |
| `memoryStore.ts` | `server-only` | The only file naming a phase-1 memory writer; forces the `admin` label. |
| `memoryActions.ts` | `'use server'` | The six memory actions: save a slot, insert a fact, edit a fact, create a reminder, edit a reminder, delete a row. |
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
export const ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS = 500   // 2026-09-15

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

The one non-blob constant here, `ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS`, is the album's other
bound-with-two-readers (the Zod field's `.max()` and the textarea's `maxLength`) and lives here for
that reason alone. **It is DERIVED, not chosen**: the combined embed input is
`description + "\n\nKeywords: " + searchKeywords`, and 2 000 (the description's own cap) + 13 + 500
= 2 513 against `NINA_EMBEDDING_MAX_CHARS`' silent 8 000-character truncation — so the keywords can
never be the half that gets cut. It is deliberately NOT
`ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS`: that constant is shared with the media table because both
tables' descriptions are one kind of sentence reaching one prompt, and `nina_message_images` has no
keywords column at all, so sharing a bound would assert a kinship that does not exist.

### `filetree.ts` (barrel) + `filetree/` — the file manager's decisions, before anything touches the network

Since 2026-09-12 the former single 1,151-line module is seven cohesive files under `filetree/`
(`bounds`, `classify`, `pathGrammar`, `sourceKey`, `uploadPlan`, `folderTree`, `mediaView`), and
`filetree.ts` stays a real file as their barrel — module resolution puts the file before a
`filetree/index.ts`, so `@/lib/admin/filetree` is unambiguous and every importer (and the ~17
in-code comments naming this path) keeps pointing at a file that exists. The barrel is an
explicit re-export shell: helpers shared between modules (`sanitiseSegment`, `compareFolded`,
`FolderPathRejection`, `FileRejection`) are exported sibling-only and stay off the public
surface, preserving the 2026-09-11 dead-exports audit. `tests/admin.filetreeBarrel.test.ts`
pins the exact public surface (13 constants + 22 functions + 7 types) and enforces the layout
rule below.

**Import-purity, restated per file: every file in `filetree/` imports only `./` siblings, and
the barrel only `./filetree/` — no package specifier, no `../`, and never a server-side or
client-only module.** Its readers are a `'use client'` explorer, a `'use server'` action
module, a Route Handler and the unit suites; one server-side import and the client half stops
compiling. Do not import `avatars.ts` for the byte cap — `planFolderUpload` takes `maxBytes` as
an argument precisely so the cap keeps one home.

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
// ADMIN_FOLDER_OP_MAX_IDS = 500 — blast radius of one move/remove, not a body bound;
//   module-private since 2026-09-13, used only by avatarIdsSchema in this file
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
export const avatarIdSchema
export const cropWriteSchema
export const avatarDescriptionSchema   // { id, description } — the album prose edit
export const avatarSearchKeywordsField // 2026-09-15 — the keyword line's normaliser
export const avatarSearchKeywordsSchema// { id, searchKeywords } — its twin, the tag edit
export const avatarRegisterSchema      // live caller: explorer/thumbnail.ts
// userIdSchema, slotKeySchema — module-private since 2026-09-13; no reader outside this file
export const slotEditSchema
export const factInsertSchema
export const factEditSchema
export const reminderCreateSchema      // 2026-09-16 — { userId, timeOfDay, label, message }
export const reminderEditSchema        // its twin plus { id } — same fields, the table sends all of them
export const memoryDeleteSchema        // discriminated union on kind
export const folderPathSchema
export const albumFilenameSchema
// sourceKeySchema, avatarBatchRecordSchema — module-private since 2026-09-13 (type AvatarBatchRecord
// stays exported and public: it has a live reader, explorer/useFolderUpload.ts)
export const avatarBatchRegisterSchema
export const albumManifestSchema
export const ninaTuningWriteSchema     // type NinaTuningWriteInput
export const shortcutInsertSchema
export const shortcutCellSchema        // discriminated union on `field`
export const shortcutToggleSchema
export const shortcutDeleteSchema
export const ninaImagePrefsWriteSchema // type NinaImagePrefsWriteInput
```

**2026-09-13 dead-export sweep.** A knip pass flagged 13 `z.infer` type aliases in this file
(`CropWrite`, `AvatarDescriptionInput`, `AvatarRegister`, `SlotEdit`, `FactInsert`, `FactEdit`,
`MemoryDelete`, `AvatarBatchRegister`, `AlbumManifestRequest`, `ShortcutInsert`, `ShortcutCell`,
`ShortcutToggle`, `ShortcutDelete`) and 4 schema consts (`userIdSchema`, `slotKeySchema`,
`sourceKeySchema`, `avatarBatchRecordSchema`) as exported with no importer anywhere under
`app/ components/ lib/ tests/` — every action file that calls the corresponding schema (e.g.
`memoryActions.ts` importing `factInsertSchema`) infers its own input type from the schema value
rather than importing the `z.infer` alias, so the alias had never had a reader. The types were
deleted outright; the four schema consts are still used *inside this file* by the schemas above
them, so only their `export` keyword came off — grep before deleting an "unused export": an
unused EXPORT is not always an unused VALUE.

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
  half a batch invisibly. The one exception to all-or-nothing is `contentHash`, added
  2026-09-15: `z.string().min(1).max(128).nullish()` — **shape here, format in the action**.
  `null` is what the client sends when it could not hash, ABSENT is every record written before
  that date, and a malformed claim is normalised to NULL by `isValidContentHash` in
  `registerNinaAvatarsAction` — a bad hash must cost a row its duplicate check, never cost the
  batch its upload. It is NOT the album's dedupe key and must never become one: `sourceKey` and
  its unique index decide what lands, and two identical files under two folder paths are two
  rows on purpose.
- `avatarSearchKeywordsField` (2026-09-15) is **not `chatPhotoDescriptionField` with a different
  max**, and the difference is the whole reason it exists: a description is a PARAGRAPH, so that
  field preserves its newlines and only collapses runs of three or more; this is a LINE about to be
  joined into embedded text under a `"Keywords: "` label, so **every** whitespace run (newlines
  included) folds to one space — a newline inside it would put a second, unlabelled block into the
  vector's input. Beyond that it does nothing: no splitting on commas, no sorting, no
  de-duplication, no case folding. The operator's free text is embedded verbatim, and a validator
  that re-punctuated it would store something nobody typed. Same two shared rules as its twin:
  `.max()` **before** the transform (an over-long paste is refused inline, never truncated into
  range), and no `.min(1)` (the empty box is the clear — the action turns `''` into `NULL`).
- `memoryDeleteSchema` is a discriminated union on `kind` (`slot` | `promise` | `fact` |
  `reminder` since 2026-09-16) — the one delete control's four branches, exhaustive by
  construction. The four per-kind schemas it replaced (`slotRetire`, `promiseRemove`,
  `factRetract`, `factPurge`) are gone with the actions they served.
- `reminderCreateSchema` / `reminderEditSchema` (2026-09-16) are **one field object extended
  twice** — the edit is the create plus an `id`, because the table sends the whole row either way
  and two hand-written shapes would drift. The time field is validated against
  `NINA_REMINDER_TIME_PATTERN` imported from `lib/nina/schema.ts` (the same source string the
  model's own tool schema uses — the `HH:mm` grammar is not re-spelled here), and the label and
  message caps come from `memoryModel.ts`'s `ADMIN_REMINDER_LABEL_MAX` (60) /
  `ADMIN_REMINDER_MESSAGE_MAX` (300), which are in turn the same numbers as
  `NinaReminderWriteSchema`'s. One field, one cap — see *Every bound here is imported* above.
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
export async function editNinaAvatarSearchKeywordsAction(input): Promise<AdminActionResult>
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

**Where a description is earned.** `describeNinaImages` is off every upload path's CLOCK, and
since 2026-09-15 that is the only half of the old rule that survives. It runs on the share path
(`ensureNinaAvatarDescriptionAction`), on demand (`describeNinaAvatarAction` — also the manual
re-describe, which OVERWRITES hand-written prose), on promotion, and — this is what changed —
inside `after()` for **every row a batch inserted**, not for `rows[0]` alone. A describe call is
~8–11 s and Server Actions dispatch one at a time per client, so awaiting it per upload would add
three hundred latencies instead of overlapping them; that argument is untouched. What was repealed
is the *"for descriptions of photographs Nina may never be shown"* clause: the description is now
the album's search index, so every photograph is shown — to the search — the moment the operator
types. `ninaAlbumDeferredDescribe.ts` below carries the three bounds that make per-row describing
safe. The album describe uses the `'self'` subject (via `describeSubjectForSide('hers')`) — every
album row is a photograph of HER; the runner-default prompt went looking for a man who is not in
the frame.

Since 2026-09-15 this module also DECLARES the album search's three result types
(`AdminSearchMode`, `AdminSearchHit`, `AdminSearchResult`) and re-exports
`searchNinaAvatarsAction` — the standing rule being that a `'use server'` module may export only
async functions, so any type the browser needs by name lands on this plain barrel and the action
imports it back. Its own file's behaviour is documented under the read side below.

**`editNinaAvatarDescriptionAction`** is the album twin of the media collection's hand-written
edit: no VISION call, empty box clears to NULL (D1), and it revalidates `/admin/nina`. An empty
description degrades honestly — her context's avatar block omits it. Since 2026-09-15 it does have
an `after()`, and only one: the new prose is written with a **NULL vector in the same UPDATE**
(`setNinaAvatarDescriptionAndEmbedding(userId, id, next, null)`) and `scheduleEmbed` re-earns the
vector afterwards. "No model call" was never the invariant — *no re-describe* was; an embedding of
the operator's own sentence is not a rewrite of it. A cleared box schedules nothing at all.

**`editNinaAvatarSearchKeywordsAction`** (2026-09-15) is the album's OTHER free-text write: the
operator's comma-separated tags (`"tete, putih"`), stored in `nina_avatars.search_keywords` and
embedded with the description rather than searched on their own. Its policy is
`editNinaAvatarDescriptionAction`'s, line for line — no model call, no `after()` vision pass, an
empty box clears to `NULL`, and the vector is NULLed in the SAME UPDATE
(`setNinaAvatarSearchKeywordsAndEmbedding`) and re-earned by `scheduleEmbed` afterwards, because it
is derived from these words too. Three things about it are rules rather than shape:

- **It is a second ACTION, not a second field on the prose edit.** The panel has two independent
  boxes with two independent drafts, so a merged action would make saving the description overwrite
  keywords the operator had typed but not saved. More importantly, a merged WRITER would put a
  `searchKeywords` parameter within reach of the re-describe path — which is exactly the thing that
  must be structurally unable to spell it. `shortcutCellSchema` already rules for this shape on this
  repo's ground: one control, one field, one action, because the fields have different caps and
  different meanings.
- **A row with no prose schedules nothing.** The embedded text is ANCHORED on the description
  (`buildNinaAvatarEmbedText` returns the description, plus a labelled keyword line); there is no
  keywords-only vector, so `scheduleEmbed` on a description-less row would be a read that finds
  nothing to do. That row is already in `listNinaAvatarDescribeBacklog`, and the describe sweep will
  write prose and then embed the pair — the state heals through the path that exists rather than
  through a new branch in the worker.
- **`describeNinaAvatarAction` READS the column and never writes it.** It re-reads
  `row.searchKeywords`, hands it to `embedNinaAvatarDescription` so the new vector still carries the
  tags, and the omission from the UPDATE is structural rather than remembered:
  `setNinaAvatarDescriptionAndEmbedding` sets two columns and `search_keywords` is not one of them.
  That asymmetry is the point — a re-describe overwrites the model's own previous opinion, and the
  keywords are the operator's correction OF that opinion.

**All four prose/keyword actions REDIRECT for a pointer row** (2026-09-17). An album row with
`source_image_id` set holds no prose of its own, so `describeNinaAvatarAction`,
`editNinaAvatarDescriptionAction`, `editNinaAvatarSearchKeywordsAction` and
`editNinaAvatarNegativeSearchKeywordsAction` each branch on `row.sourceImageId == null` and write
the LINKED `nina_message_images` row instead, re-embedding through `scheduleMediaEmbed`. Four rules
hold the shape:

- **The branch is spelled at each of the four sites, not hidden in a helper.** Each action writes a
  different column pair, and a helper taking "which column" would be precisely the merged writer
  `setNinaAvatarSearchKeywordsAndEmbedding`'s docstring argues against.
- **`describeNinaAvatarAction` DELEGATES rather than re-implements** — it calls
  `describeChatPhotoAction({ id: row.sourceImageId })` and returns its result unchanged. That keeps
  one vision call, one witness choice (`photoSideOf` there, never `'hers'` here) and one suite, and
  it is what makes "re-describe from the album pane" and "re-describe from the Media pane" the same
  operation. The return types are structurally identical and the delegate's revalidate target
  (`ADMIN_CHAT_PHOTOS_PATH`) **is** `/admin/nina`, so nothing is lost in the hand-off.
- **The keywords branch schedules the re-embed UNCONDITIONALLY**, where the album branch still
  guards on `row.description != null`. A pointer's own `description` is NULL by construction, so the
  "only a row that HAS prose has a vector to re-earn" test has to be asked of the *linked* row —
  and `scheduleMediaEmbed` asks it itself inside its `after()`. One fewer read on the request path,
  same authoritative skip.
- **There is no dual write and nothing reconciles.** That is the design, not an omission: the only
  arrangement that cannot drift is the one with a single row holding the data.

**`setChatPhotoAsAvatarAction`** adopts a media-collection photograph as her face: it refuses
reference rows (`source_avatar_id`/`source_image_id` — make the original hers instead), clamps
the framing against the row's REAL dimensions server-side, and files the album row under
the stable `sourceKey` `` `chat-photo:<id>` `` (idempotent — a second adoption finds the existing
row via `getNinaAvatarBySourceKey`, and `nina_avatars_user_source_key_unq` backs the race).

**Since 2026-09-17 it LINKS rather than copies, and that reversal is the phase's centre.** The
private helper is `linkChatPhotoIntoAlbum` (it was `copyChatPhotoIntoAlbum`): one INSERT carrying
the media row's own `blobUrl`/`pathname` verbatim plus `sourceImageId`, with **no `fetch`, no
`put`, no second Blob object and no `description`**. The old design's two stated reasons survive
without the copy — the crop was never in the bytes (`crop_*` are the album row's own columns), and
reference-checked shared-blob deletion already exists (`releaseBlobIfUnreferenced` /
`isBlobPathnameReferenced`) with this phase's two row-level guards closing the rest. What the copy
bought and the link does not is a second source of truth for the prose, which is exactly what had
to go. The `try`/`catch` went with the `fetch`/`put`: there is no vendor call left to convert into
a sentence, and the only non-exceptional failure — losing the unique-index race — is still handled
by re-reading the winner's row, which now needs no reconciling and leaves no object to reap.

It then schedules **`scheduleMediaDescribe(userId, row.id)` — the MEDIA row, not the album row.**
The pointer will never carry a vector, so scheduling the album worker on it would be a read that
finds a NULL description it must not invent prose for, every time. Scheduling stays
**unconditional** for the reason the 2026-09-15 guard removal established: the scheduler re-reads
inside its own `after()` and a prose-plus-vector row is an authoritative skip at zero vendor calls,
so the caller has no business guessing. Since 2026-09-12 (P1-NIN-A039) that key has a second reader: the admin image-reference picker's
chat side (`lib/nina/queries.ts`'s `generatedChatPhotoScope`) reads it in a correlated
`NOT EXISTS` to exclude the adopted original, so the picker offers the photograph once — as its
album entry (a pointer since 2026-09-17, which changes nothing about that read: it keys on
`source_key`, not on who owns the bytes).

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
Since 2026-09-15 it closes with **one** `scheduleDescribeAll(userId, rows.map(r => r.id))` — one
`after()` per BATCH, not one per row, and separate from the empty-album promotion above it, which
is about `is_current` and has never been about descriptions.

**The batch's duplicate scan** (2026-09-15, in `ninaAlbumUploadActions.ts`): the browser hashes
the picked file, the record carries the claim, `insertNinaAvatars` writes it to `content_hash`,
and a private synchronous scheduler — `scheduleAvatarDuplicateScan`, a third `after()` scheduler
beside `scheduleDescribe` and `scheduleChatPhotoCaption` — asks phase 1's cross-table
`findGlobalDuplicatePhoto` about it once the response has gone out. Four rules, each a rule:

- **It scans the rows that ACTUALLY landed, not the records submitted.** `rows` is `RETURNING`
  after `ON CONFLICT DO NOTHING`, so a re-dropped folder produces an empty array and schedules
  nothing at all — the common case costs zero. Hashes reach the scan joined by `pathname`, the
  same join the result already uses and for the same reason (`avatarColumns` projects neither
  `source_key` nor `content_hash`, and position after a conflict-skipping `RETURNING` is not a
  promise).
- **The exclusion is the WHOLE chunk, not the asking row.** "Already" means *before this drop*.
  One drop is up to fifty files and a re-organised library routinely holds the same picture twice
  under two paths; both land (the `source_key`s differ, deliberately), so a per-row exclusion
  would make each find the other and announce a photograph this same gesture created.
- **One push per chunk, the true count to the log.** The first hit calls
  `notifyDuplicateImagePush`; the rest are counted. Every push this app sends shares one
  `PUSH_NOTIFICATION_TAG = 'nina'` with `renotify`, so N sends already collapse to ONE visible
  notification — fifty sends would be fifty web-push round trips to redraw one tray entry, and a
  phone the operator turns push off on. The folder drop is the only route in the app that submits
  fifty images in one gesture; the single-image routes keep one push per detected duplicate.
- **It is off the response path and cannot fail the register.** A chunk of 50 against a
  three-table finder is up to 150 round trips on an action Next dispatches one at a time per
  client. The rows are committed and the grid revalidated before it runs; `after()` turns a
  rejection into a log line and a per-row `try`/`catch` keeps one unreadable row from costing the
  other forty-nine their check.

**`deleteNinaAvatarAction`** — row first, blob second, TWO `del()` targets in one call: the row
is the only record that the thumbnail object exists (its stored pathname carries Blob's random
suffix and is not derivable). The current photo cannot be removed — the query's WHERE refuses it,
which makes "zero current avatars" unreachable rather than repaired. A failed `del` logs and still
reports success: a recoverable orphan beats a permanently broken image under a live row.

Since 2026-09-17 it has a **pointer branch**, and the shape of it is the rule. A single-row
`getNinaAvatar` runs BEFORE the delete — `deleteNinaAvatar`'s `RETURNING` projection is the
blob-ref shape and does not carry `source_image_id`, and after the DELETE there is nothing left to
ask. Step 1 (`promoteNinaAvatarDependents`) runs for a pointer **too**: a chat row can re-show an
album row whatever its provenance, that FK is `ON DELETE SET NULL` and fires inside the DELETE, so
skipping the promotion would mint exactly the ghost `lib/nina/provenancePromotion.ts` exists to
bury. Step 3 (the blob release) is skipped **entirely** for a pointer: it owns no object and has no
thumbnail. Asking anyway would be *safe* rather than wrong (`isBlobPathnameReferenced` reads both
tables and would answer `'shared'`), so the skip is about cost and clarity — the absence of the
call is the clearest statement of the invariant there is.

**`listNinaAlbumManifestAction`** — every stored dedupe key under a folder subtree, called before
walking a drop so `planFolderUpload` has something to diff against. A Server Action (not a Route
Handler) because it runs once per drop and keeps `requireAdmin()` as the gate with no new `/api`
surface. `truncated` is `>=` and not `>`: a subtree holding exactly `NINA_ADMIN_MANIFEST_MAX`
(2000) reports truncated when it was not — the error is in the safe direction, and truncation is
survivable because a short manifest OVER-reports, the extra files are re-PUT, and their inserts
are discarded by `ON CONFLICT DO NOTHING`. Slower, never wrong.

### `ninaAlbumDeferredDescribe.ts` — the deferred describe-and-embed pre-pass

```ts
export const NINA_DEFERRED_DESCRIBE_CONCURRENCY = 4
export const NINA_DEFERRED_DESCRIBE_BUDGET_MS = 240_000
export const NINA_ALBUM_BACKFILL_BUDGET_MS = 240_000
export const NINA_ALBUM_BACKFILL_SLICE = 200
export interface NinaDescribeFillOutcome {
  described; embedded; failed; ranOutOfTime; alreadyDone   // every field counts ROWS, not calls
}
export async function embedNinaAvatarDescription(description: string, searchKeywords: string | null, userId: string): Promise<number[] | null>
export async function fillNinaAvatarDescribeTargets(userId, targets, budgetMs): Promise<NinaDescribeFillOutcome>
export function scheduleDescribeAll(userId: string, ids: readonly string[]): void
export function scheduleDescribe(userId: string, id: string): void
export function scheduleEmbed(userId: string, id: string): void
```

Not a `'use server'` module and it must not become one: a `'use server'` module may export only
async functions, and all three schedulers are synchronous. Its importers are the action modules
behind the `ninaAlbumActions.ts` barrel plus
`app/api/admin/nina/backfill-descriptions/route.ts`, which reuses the worker WITHOUT the `after()`
because it is already off a render path and wants the outcome in its own response.

**Three schedulers, one worker, and the difference between them is a single boolean.**
`scheduleDescribeAll` / `scheduleDescribe` pass `describe: true`; `scheduleEmbed` passes `false`,
which means "a human wrote this prose — embed it and never summon the vision model". A row with a
NULL description under `describe: false` is left alone: an operator who CLEARED the box asked for
silence, and the empty-box-is-the-clear rule (D1) does not license inventing a replacement.

**The three bounds that make describing EVERY row safe** (the header of the file argues each; they
are rules, not tuning knobs):

1. **It is still `after()`.** The operator's upload response is unchanged, to the millisecond.
   Nothing moved onto the request path.
2. **Lanes, not `Promise.all`.** `NINA_DEFERRED_DESCRIBE_CONCURRENCY` = 4 — the same number
   `EXPLORER_UPLOAD_CONCURRENCY` chose for the same vendor exposure on the blob side, spelled here
   rather than imported because that hook is a client module and this is a server one. Fifty
   simultaneous vision calls is a rate-limit incident. The lane loop's shared `next++` needs no
   lock: JS is single-threaded and lanes only yield at an `await`.
3. **A wall-clock deadline, and it is a START gate.** `after()` inherits the **route segment's**
   `maxDuration`, not the action's — which is why `app/admin/nina/page.tsx` now declares
   `export const maxDuration = 300` (a literal; segment config is statically analysed, so a
   computed expression compiles, ships, and silently leaves the route on the platform default).
   `NINA_DEFERRED_DESCRIBE_BUDGET_MS` (240 s) reserves 60 s under it, enough for an in-flight
   describe at its own 25 s + 30 s fallback ceiling to finish and write its row. A row that has
   BEGUN always finishes — cancelling mid-describe spends the money and keeps none of the answer.
   Past the deadline the lanes keep draining the array without working, so `ranOutOfTime` is a
   truthful count rather than "the rest, probably".

**`embedNinaAvatarDescription` is the one place that decides what an album photograph's vector is
computed FROM** (2026-09-15), and `searchKeywords` is a positional parameter rather than an option
bag precisely because it is as load-bearing as the description — an optional field is a field a
caller forgets. The JOIN itself is one level further out, in the **zero-import**
`lib/nina/avatarEmbedText.ts`: `buildNinaAvatarEmbedText(description, searchKeywords)` returns the
description unchanged when the keywords are `null`/`''`/whitespace (which is why every vector
computed before the column existed is still numerically correct), and otherwise appends
`"\n\nKeywords: "` and the stored string verbatim — a blank line and a LABEL, not a comma-append,
because appending `", tete, putih"` to the last sentence reads to the model as part of that
sentence. Nothing is parsed, split, sorted or re-punctuated. The join lives outside Next's runtime
because three runtimes need the identical bytes — this worker, `scripts/backfill-avatar-embeddings.mjs`
under `node --experimental-strip-types`, and the `/search-analysis` diagnostic; a second spelling
would put half the corpus in one space and half in another with no error anywhere. **Do not add an
import to that module** (`lib/id.ts`'s rule): a `@/` alias or a runtime dependency breaks the script.

The worker reads the keywords in the SAME statement the rest of the target came from
(`NinaAvatarDescribeTarget.searchKeywords`, `listNinaAvatarDescribeTargets`) — one read per batch,
still — and cannot write them: its UPDATE is `setNinaAvatarDescriptionAndEmbedding`, two columns,
and `search_keywords` is not one of them. That is also what makes it the re-earn path for
`editNinaAvatarSearchKeywordsAction`: the keywords are already written, the vector is NULL, and
`describe: false` recomputes the vector from the pair with no vendor image call.

**Every write goes through `setNinaAvatarDescriptionAndEmbedding`** (`lib/nina/queries/avatarEmbeddings.ts`,
new in this phase alongside `listNinaAvatarDescribeTargets`, `listNinaAvatarDescribeBacklog` and
`countNinaAvatarDescribeBacklog`). One `SET` of two columns has no window in which the row is a
lie; two statements always do, in one direction or the other. `setNinaAvatarDescription` is
untouched and still correct for a write that is deliberately NOT accompanied by a vector.
Since 2026-09-15 it has a twin, `setNinaAvatarSearchKeywordsAndEmbedding` — the other input to the
same derived column, written the same one-statement way. **Two functions rather than one with a
third parameter**, because the two callers write different columns and must not be able to write
each other's: a merged `set({ description, searchKeywords, descriptionEmbedding })` would hand the
re-describe path an argument it has no business having, and the first time someone passed the wrong
thing a vision pass would silently erase the operator's tags with the row still looking healthy.

**An embedding failure never costs the prose.** `embedNinaAvatarDescription` catches and answers
`null`, and `null` is a real argument rather than a degenerate one: it writes a NULL vector, which
is exactly the state the backlog read picks up next sweep. The failure degrades into "not
searchable yet" — which is what it is — and never into "the model's words were thrown away".
Per-row failures are non-fatal and leave the card's "Describe it" button as the recovery, exactly
as the old register-path pre-pass did; that property is inherited, not re-litigated.

**Per-row, not per-batch, state.** A worker killed mid-flight leaves the same state as one that
never started, because each row is written as it completes. That is what makes the backfill route
below safe to re-POST, and what makes a short run visible instead of silent.

**`describeNinaAvatarAction` embeds IN BAND, not in `after()`** — the one deliberate asymmetry.
The operator is already waiting ~8–11 s for the vision call they clicked; one small text request
on top of that is not worth a second moving part, and `ensureNinaAvatarDescriptionAction`
delegates to it precisely because it needs the answer in its own return value. Its fast path
deliberately does NOT check `description_embedding`: sharing a photo to Nina is about the prose
reaching her prompt, and making a share tab wait on an embedding call would answer the search
question in the most expensive possible place.

### `app/api/admin/nina/backfill-descriptions/route.ts` — the one-time sweep (outside the package, owned by it)

`GET` reports the backlog and spends nothing; `POST` does one slice and reports what is left. It
lives under `app/api/` but every decision in it is this package's, and `requireAdminApi()` is line
1 of both handlers — `proxy.ts` matches neither `/admin` nor `/api/*`, so that call is the only
thing between the open internet and a route that spends vendor money per request. Non-admin gets
the pages' 404, signed-out gets a 401 (a `fetch()` deserves a status, not a redirect to HTML), and
`userId` comes from the session and is never read from the request.

- **Why a route and not a script**: the sweep needs `describeNinaImages` and `embedNinaText`, both
  `import 'server-only'` and both behind `@/` aliases, so a plain node process cannot load them —
  and a script-local second spelling of the same two vendor calls is what
  `ensureNinaAvatarDescriptionAction`'s docstring refuses outright. **Why not a Server Action**: an
  action with no importer is a dead export; `app/**/route.ts` is an entry point by convention.
- **It is a slice and the operator loops it.** One POST does what fits in
  `NINA_ALBUM_BACKFILL_BUDGET_MS` and reports `remaining`. Safe to re-POST immediately and safe to
  POST twice by accident: the backlog read is `description IS NULL OR description_embedding IS
  NULL`, oldest-first, so a finished row leaves the backlog and a raced row is written twice with
  equal values. Nothing here is a transaction and nothing needs to be.
- **`NINA_ALBUM_BACKFILL_SLICE` (200) deliberately over-reads the budget.** The read is one
  indexed statement; idling four lanes because a 20-row slice ran dry with two minutes left is the
  expensive mistake, not the extra rows.
- **`remaining` is RE-READ, never derived** from `targets.length - done`: an upload's `after()`
  may have filled rows in parallel, and `remaining` is the operator's loop condition.

### `scripts/backfill-avatar-embeddings.mjs` — the uniformity proof (outside the package, owned by it)

`npm run nina:backfill-embeddings` (add `-- --dry-run` to read and report without a vendor call or a
write; `-- --limit N` for the oldest N). It re-embeds every album row that HAS a description,
oldest-first, sequentially, through the same combine-then-embed path the app uses. A NULL
description is not read at all — inventing prose is the describe sweep's job.

- **Why it exists is not "fill in missing vectors" — the route above does that.** Every pre-existing
  row has `search_keywords = NULL`, and `buildNinaAvatarEmbedText` returns the description unchanged
  for a NULL, so those rows recompute to a NUMERICALLY IDENTICAL vector. That is the point: the run
  is the proof, taken once at the moment the second input was introduced, that ONE combine function
  governs every vector in the table.
- **A script and not a route, unlike the backlog sweep, because it imports the combine function
  rather than the vendor clients.** `buildNinaAvatarEmbedText` is imported (a local copy of the join
  would be testing its own copy); the embeddings URL, the model id, the vector width and the SQL are
  DUPLICATED, the `album-search-probe.mjs` convention, because `lib/nina/embedding.ts` opens with
  `import 'server-only'` and the worker opens with `import { after } from 'next/server'` — neither
  survives a plain node run. If the model or the width migrates in `lib/nina/openrouter.ts` /
  `lib/db/schema/nina/avatars.ts`, this copy moves with it or the run writes vectors into a space
  the album is not stored in.
- **Sequential on purpose.** A burst against one broker buys minutes and risks a 429 mid-run, and a
  half-written table is exactly what this script exists to rule out. It refuses a `DATABASE_URL`
  that is not Neon before it does anything.
- Run for real 2026-09-15: **53/53 rows re-embedded, 0 failed** (a count of that album on that day,
  not a property of the script).

### `ninaAlbumSearchSchema.ts` / `ninaAlbumSearchActions.ts` — the read side (album **and** media)

```ts
export type AdminSearchMode = 'text' | 'image' | 'both'        // declared on the ninaAlbumActions barrel
export interface AdminSearchHit {          // ExplorerPhotoBase + score, since 2026-09-17 plus:
  origin: 'album' | 'media'                // which collection — mirrors ExplorerPhoto's own discriminant
  searchKeywords: string | null            // carried so the pane shows both boxes without a round trip
  negativeSearchKeywords: string | null
  /* … id, url, thumbUrl, folder, filename, width, height, bytes, source, isCurrent,
     description, crop, createdAt, score — unchanged */
}
export interface AdminSearchResult extends AdminActionResult { hits; searched; mode; caption? }

export async function searchNinaAvatarsAction(input): Promise<AdminSearchResult>
```

Added 2026-09-15; **merged across both collections 2026-09-17**. The action's NAME is unchanged and
its scope is not: it calls `searchNinaPhotosBy{Text,ImageCaption,TextAndCaption}` (the renamed
`searchNinaAvatarsBy*` family) and gets back one ranked list in which every physical photograph
appears at most once. Three rules came with the merge:

- **One mapper, not two, because the query layer already resolved the differences.** A media row
  has no folder, no framing, no thumbnail and can never be her current face, and
  `lib/nina/queries/avatarsearch.ts` fills each of those with the Media view's own documented
  constant (`''`, three NULLs, `null`, `false`) rather than leaving the convention to be
  re-invented here. `toHit` therefore stays the field-for-field narrowing it always was, now typed
  on `NinaPhotoSearchRow` instead of an inline structural type.
- **`filename: row.filename ?? row.id` does double duty.** A media row carries `null` (that table
  has no filename column) and so prints its id, which is a truthful name. The Media view's nicer
  date-and-id form is built in `app/admin/nina/page.tsx` and is the UI phase's to reuse.
- **A POINTER album row never appears in results at all** — its vector is permanently NULL, so
  `albumSearchScope` excludes it, and the media row it points at is the one that ranks. That is why
  `AdminSearchHit.searchKeywords` is never a borrowed value and never NULL-because-linked.

**The only READ action in the layer**, and the rules that follow from that: it
stores nothing, writes nothing, and must NOT `revalidatePath` — a search that re-rendered the grid
underneath its own results fights the screen it is on.

- **The three result types are declared on `ninaAlbumActions.ts`, not here.** Same rule that put
  `AdminActionResult` there: a `'use server'` module may export only async functions, and the UI
  imports the hit type by name. The action imports them back.
- **`requireAdmin()` is line 1 and its `userId` is the only one any statement sees.** The action
  never reads an id from its own argument, so a hand-crafted POST cannot search another album.
- **"Search by image" is search by caption.** There is no image-embedding model in this app's
  arsenal, so the uploaded photo is captioned by `describeNinaImagesWithFallback` under
  `describeSubjectForSide('hers')` — the SAME witness prompt that wrote every album row's
  `description`, called through the same mapping rather than spelling `'self'`, because captioning
  the query in a different register would make cosine similarity measure prompt style as much as
  content. The caption is then embedded and searched exactly as typed text is.
- **The query image is never stored.** No Blob PUT, no row, no reaper to teach. It rides as a
  `dataUri` straight into the describe path; a comparison input that lives for one request has no
  business in a store.
- **Two model calls on the request path, awaited, and that is correct.** The non-blocking rule is
  about RENDER paths; a Server Action fired from a click is where an expensive call belongs. The
  caption is its own `await` (the embeds need it); the two embeds then go together in one
  `Promise.all`, so a combined search costs one round trip's latency, not two.
- **Failure is always the same shape** — `ok: false`, an operator-readable sentence, `hits: []`,
  `searched: 0`, and the `mode` echoed back. The vendor layers have already written their own
  `nina_error_logs` rows by the time an error arrives, so this catch reports rather than re-logs.
  The vision error classes get their own sentence because they name the half of the query the
  operator can change — a token-floor refusal means "a different photo", never "retry".
- **`searched` is coverage, not the collection's size.** It counts the rows that carried an
  embedding and were therefore compared; a results pane that reads it as a total will tell the
  operator a photo is missing when it is only un-described. Since 2026-09-17 it is the SUM across
  both collections — album rows plus media rows carrying a `description_embedding` and not
  superseded by a legacy copy.
- **The schema refuses rather than truncates, and normalises whitespace before the vendor.**
  `.max()` before `.transform()` (this repo's ordering rule), so an over-long paste is reported, not
  silently half-searched; the transform folds whitespace runs so `"  red   dress \n"` and
  `"red dress"` produce the same vector. The refine is the rule worth stating twice: an all-blank
  box never reaches a model. The data-URI ceiling is sized against Next's default 1 MB Server Action
  body (the URI IS the body) and the type allow-list is `jpeg|png|webp` only — no `svg`, no `gif`,
  no hosted URL — because the string goes straight into an `image_url` part.

### `chatPhotos.ts` / `chatPhotoSchema.ts` / `chatPhotoActions.ts` — the media collection

```ts
// chatPhotos.ts — the ceilings and the shapes
export const ADMIN_CHAT_PHOTOS_PATH = '/admin/nina'   // the collection lives in the explorer now
// ADMIN_CHAT_PHOTO_PURPOSE ('selfie'), ADMIN_CHAT_PHOTO_EXT ('jpg'), ADMIN_CHAT_PHOTO_ID_RE and
// ADMIN_CHAT_PHOTO_STORED_ID_RE ("one predicate, two windows" — the requested id shape and the
// Blob-suffixed stored shape) are module-private since 2026-09-13: every reader was this file's
// own adminChatPhotoPathname/isAdminChatPhotoPathname, never an external import.
export const ADMIN_CHAT_PHOTO_CONTENT_TYPE = 'image/jpeg'
export const ADMIN_CHAT_PHOTO_MAX_UPLOAD_BYTES = 2 * 1024 * 1024
export const ADMIN_CHAT_PHOTO_MAX_EDGE_PX = 12_000
export const ADMIN_CHAT_PHOTO_MAX_URL_CHARS = 2048
export const ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS = 2000
export const ADMIN_CHAT_PHOTO_MAX_SEARCH_KEYWORDS_CHARS = 500           // 2026-09-17
export const ADMIN_CHAT_PHOTO_MAX_NEGATIVE_SEARCH_KEYWORDS_CHARS = 500  // 2026-09-17
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
export const chatPhotoSearchKeywordsField          // 2026-09-17: .max(500) then transform
export const chatPhotoSearchKeywordsSchema         // { id, searchKeywords }
export const chatPhotoNegativeSearchKeywordsField  // 2026-09-17: .max(500) then transform
export const chatPhotoNegativeSearchKeywordsSchema // { id, negativeSearchKeywords }

// chatPhotoActions.ts
export async function addChatPhotoAction(input): Promise<ChatPhotoActionResult>
export async function replaceChatPhotoAction(input): Promise<ChatPhotoActionResult>
export async function findChatPhotoDuplicateAction(contentHash, sourceHash?): Promise<{id, blobUrl, pathname} | null>
export async function removeChatPhotoAction(input): Promise<ChatPhotoActionResult>
export async function editChatPhotoDescriptionAction(input): Promise<ChatPhotoActionResult>
export async function describeChatPhotoAction(input): Promise<ChatPhotoActionResult>

// chatPhotoKeywordActions.ts — 2026-09-17, its own module
export async function editNinaMessageImageSearchKeywordsAction(input): Promise<ChatPhotoActionResult>
export async function editNinaMessageImageNegativeSearchKeywordsAction(input): Promise<ChatPhotoActionResult>
```

**The two keyword constants are SIBLINGS of the album's, never imports of it.** 500 each, and the
duplication is the decision: `ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS`' own docstring already
declined to cross this boundary in the other direction, and *two constants that agree beats one
shared across a boundary the file next door refused*. The positive one's NUMBER is still derived —
`NINA_EMBEDDING_MAX_CHARS` truncates at 8 000 and the combined text is
`description + "\n\nKeywords: " + searchKeywords`, so 2 000 + 13 + 500 = 2 513 and the keywords can
never be the half that gets cut. The negative one's is not derived at all (that column never joins
the embedded text); it is the "a human types this" ceiling, agreeing today without promising to.

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

**Add tells his phone** (`nina-push-every-message` R2, *"when Nina speaks on her own initiative,
a push notification is sent"*): after `scheduleChatPhotoCaption` and before `revalidatePath`,
`addChatPhotoAction` sends **exactly one** notification — `notifyNinaPush(userId, [{ id:
message.id, body }], 'admin_chat_photo')` for a genuinely new photograph, or
`notifyDuplicateImagePush(userId, duplicate)` when the collection already held these bytes (see
the next block). Three rules hold it together, and each is a rule rather than a detail:

- **The caption is minted once and spent twice.** `body = ninaImageCaption(newId())` is a `const`
  read by the message insert AND by the notification. `ninaImageCaption` is `pickLine` over a
  FRESH id — pure but not idempotent across calls — so a second draw for the push would put one
  of the pool's other lines on the lock screen four times in five, a sentence the chat does not
  contain. Pass `body`, never `message.body` and never a second call.
- **It sits past every refusal, and that IS the guard.** All four `{ ok: false }` returns — the
  vanished pinned row, the pathname outside her folder, the message that could not be opened, and
  the image that could not be attached (which DELETES the bubble it just wrote) — return above the
  notify. Reaching the call is the proof that a message row and an image row are both committed;
  there is no fifth condition to test, and putting it beside the insert would let a notification
  open a chat showing a caption above an empty frame.
- **It never fails the add.** `notifyNinaPush` already swallows everything a push can do wrong (no
  VAPID, no subscriptions, a dead endpoint, a vendor 500); the `try/catch` here is the belt to
  that brace and only `console.warn`s. An operator must never see "The photo could not be
  attached" because a phone was unreachable, and a notify failure must not cost the photograph its
  deferred caption.

This is also what makes `scheduleChatPhotoCaption`'s own sentence — the bubble arrives "on the
next load or service-worker refresh" — true. The service worker's `nina:new` `postMessage` fires
only inside its `push` handler, and until this line nothing pushed for an operator-added
photograph, so the refresh half was aspirational. Of the other five actions, only replace notifies
(and never about a bubble — see below); describe/edit change an EXISTING bubble or a private note
and remove takes one away, so none of them is Nina speaking.

**Was this photograph already in the collection?** (2026-09-15) `addChatPhotoAction` asks two
questions, in the order that makes the second rare, and then lets the answer pick the push:

- **First the PLAN, with no query at all.** `duplicateTargetFromPlan(plan)` reads the answer off
  `planChatPhotoAddWrite`'s existing `sourceImageId`/`sourceAvatarId` branches — exactly one is
  set on each of its two duplicate branches, and `ninaPhotoProvenance` has already flattened a
  pinned re-share down to the photograph it re-shows, so the pointer aims at the row the operator
  would want to see. `url` is `plan.blobUrl`, not a re-read: on both branches the plan has already
  adopted the keeper's object. **This branch is not an optimisation** — it is the only one that
  can answer for a keeper whose own `content_hash` is NULL, which `planChatPhotoAddWrite` says is
  legitimate. Routing every add through the hash lookup instead would silently miss those and send
  the generic push for a photograph the collection already held.
- **Then, only for a genuinely fresh original**, phase 1's cross-table `findGlobalDuplicatePhoto`,
  excluding the row just inserted (it carries the claim, so without the exclusion every add is its
  own duplicate). `findNinaImageByContentHash` has already ruled out the chat table, so this is
  strictly the new ground: `nina_avatars` and `run_photos`.
- **A hit SUPPRESSES `admin_chat_photo` rather than adding a second push.** One event, one
  notification: the `duplicate_image` push replaces it and points at the original. On a fresh add
  nothing about the old line changed — same kind, same body, same array. Exactly one push per
  successful add, and none on any of the four refusal paths.
- **No hash, no question** (invariant 9): a malformed or absent claim is a NULL and a proceed. A
  failed lookup is a `console.warn` and a proceed too — a detection failure is not an add failure.

**Replace tells the phone, and changes nothing else.** `replaceChatPhotoAction` hoists the
`isValidContentHash` normalisation into a `const claimedHash` (the column write and the lookup
must not normalise a claim twice, in two places, to one policy) and asks the same cross-table
question AFTER the row is committed, the blob released and the captioner scheduled, excluding
this row. **The replace is never gated on the answer.** Replace's contract is "swap the bytes
behind THIS row"; a deduped replace would repoint the row at another row's object and strip its
provenance to a reference, which the collection reads then hide — the photograph the operator can
SEE would vanish from the Media folder. So nothing skips, references or unwinds: the operator is
merely told, and the notification opens the copy that was already there.

**Remove** resolves the empty-bubble problem: when the last image on a message that exists only
to carry it goes, the MESSAGE goes too (in the same transaction — `message_id` is `ON DELETE SET
NULL` since the orphan work, so a deleted SESSION cannot take photographs with it; a
runner-authored carrier message is protected by `isNinaPhotoCarrierMessage`). Orphan rows
(`messageId` NULL — every photograph from every deleted conversation) take the plain branch. The
blob is released via `releaseBlobIfUnreferenced` — the same object may sit behind another row or
her current profile picture, and the shared case is reported in the result's `note`.

**Remove also REFUSES while an album pointer names the row** (2026-09-17).
`countNinaAvatarsLinkedToImage(userId, id)` runs above `loadPhotoCarrier` and above
`promoteNinaImageDependents`, for the same reason the reference-row refusal does: nothing may be
measured, promoted or deleted on behalf of a remove that is not going to happen. It does **not**
cascade and it does **not** silently orphan — the `source_image_id` FK is `ON DELETE RESTRICT` and
Postgres would refuse this delete either way; the count exists to turn a constraint violation
(a framework error page) into the one sentence the operator already knows from
`deleteNinaAvatarAction`: *"An album entry shows this photo — remove it from the album first"*,
pluralised against the count. The constraint stays the backstop for the race the read cannot close,
exactly as `nina_avatars_user_source_key_unq` is for re-adoption's.

**Describe/prose**: `describeChatPhotoAction` is the on-demand vision pass (refuses reference
rows — describe the original instead; the token-floor error is logged LOUDLY, its own class of
incident). `editChatPhotoDescriptionAction` is the hand-written one: NO model call, NO re-caption —
**editing what she SAW is not editing what she SAID** — and an empty box clears to NULL (D1:
refusing empty would make a wrong description un-erasable). `chatPhotoDescriptionField` caps the
RAW string (`.max()`) BEFORE normalising (`.transform()`) — a 4000-char paste is refused and
reported, never sliced into range. No `.min(1)`: an all-whitespace box normalises to `''` and
parses clean — the schema hands that decision to the action.

**Since 2026-09-17 both of them write the VECTOR too**, because the column exists now — the fact
that they never embedded anything was an absence, not a decision. The album's rule applies verbatim:
*a stale vector is worse than a missing one, because a missing one is visible in the backlog count
and a stale one is invisible until a search returns the wrong photo.*

- `editChatPhotoDescriptionAction` writes the new prose with a **NULL vector in the same UPDATE**
  (`setNinaMessageImageDescriptionAndEmbedding(userId, id, next, null)`) and `scheduleMediaEmbed`
  re-earns it after the response. `scheduleMediaEmbed`, never `scheduleMediaDescribe` — a cleared
  box must not summon `glm-4.6v` to invent prose the operator just removed — and a cleared box
  schedules nothing at all. Its "no `after()`" line is therefore retired; "no re-caption" is not.
- `describeChatPhotoAction` embeds **in band**, not in `after()`: the operator is already waiting
  ~8–11 s for the vision call they clicked and an embedding is one small text request with no image
  in it. `embedNinaMessageImageDescription` never throws, so an embedding outage writes
  prose-with-no-vector and phase 4's sweep collects it; the describe never fails over an embedding.
  It **reads** `row.searchKeywords` and hands it to the embedder so the new vector keeps the tags,
  and never writes that column — structurally, since
  `setNinaMessageImageDescriptionAndEmbedding` sets two columns and `search_keywords` is not one.
  The retraction lives on the ACTION rather than inside `updateNinaChatPhotoDescription`, because
  that statement's docstring makes the columns it touches (and the ones it does not) its contract,
  and `scheduleChatPhotoCaption` writes prose through a different statement for a different reason.

**The keyword actions** (`chatPhotoKeywordActions.ts`, 2026-09-17) are the album twins' policy one
table over: `requireAdmin()` on line 1, Zod for the shape then an owner-scoped re-read then a write
whose own WHERE carries `user_id` and `isOriginalPhoto()`, an empty box clears to `NULL`, and NO
model call and NO `after()` vision pass — these are the human's words. Three rules of their own:

- **The positive one NULLs the vector in the same UPDATE and re-earns it**
  (`setNinaMessageImageSearchKeywordsAndEmbedding` + `scheduleMediaEmbed`), because
  `buildNinaAvatarEmbedText` folds these words into the embedded text. The negative one touches no
  vector at all and schedules nothing: `negative_search_keywords` never joins that text, and
  `matchesNegativeKeyword` reads the column fresh at search time.
- **A row with no prose schedules nothing.** The embedded text is anchored on the description;
  there is no keywords-only vector, and such a row is already in
  `listNinaMessageImageDescribeBacklog`, where the sweep writes prose and then embeds the pair.
- **A REFERENCE row is refused.** A row carrying `source_avatar_id`/`source_image_id` re-shows a
  photograph living elsewhere and is excluded from every collection read and from the merged
  search, so keywords on it would be words nothing can match. `getNinaMessageImage` deliberately
  does not filter (it is the bubble and viewer read too), so each action enforces membership at its
  own seam — `isChatPhotoReference` stays private to `chatPhotoActions.ts`, and the two-field test
  is held to one rule by tests rather than by imports.

### `ninaMediaDeferredDescribe.ts` — the MEDIA describe-and-embed pre-pass

```ts
export const NINA_MEDIA_DEFERRED_DESCRIBE_CONCURRENCY = 4
export const NINA_MEDIA_DEFERRED_DESCRIBE_BUDGET_MS = 240_000
export const NINA_MEDIA_BACKFILL_BUDGET_MS = 240_000
export const NINA_MEDIA_BACKFILL_SLICE = 200
export async function embedNinaMessageImageDescription(description, searchKeywords, userId): Promise<number[] | null>
export async function fillNinaMessageImageDescribeTargets(userId, targets, budgetMs): Promise<NinaDescribeFillOutcome>
export function scheduleMediaDescribe(userId, id): void   // describe if needed, then embed
export function scheduleMediaEmbed(userId, id): void      // embed only — never a vision call
```

Added 2026-09-17. `ninaAlbumDeferredDescribe.ts`'s twin, one table over, and everything about it
that is not a rule below is deliberately that module's unchanged: the same `after()` posture, the
same four lanes over a shared index, the same wall-clock budget against `/admin/nina`'s 300 s
segment, the same non-fatal-failure contract, and the same `NinaDescribeFillOutcome` shape —
**imported rather than re-declared**, so the two pipelines report in one vocabulary.

- **It is a sibling module, NOT a `kind` parameter on the album one, and the reason is behavioural.**
  A table discriminant would have to thread through `fillOne`, `runFillLanes`, `scheduleFill` and
  `embedNinaAvatarDescription` — five signatures changed so one of them can pick a table. And the
  fork is not a table swap: every `nina_avatars` row is a photograph of HER, so the album worker
  hard-codes `describeSubjectForSide('hers')`, while this table holds **both sides** and reads
  `photoSideOf(target.kind)`. Picking the wrong witness is a measured defect with a name — *the
  prompt went looking for a man who is not in the frame*. Different function body, not a different
  table name.
- **`embedNinaMessageImageDescription` is the only place that decides what a media row's vector is
  computed FROM**, and it must agree with `embedNinaAvatarDescription` byte for byte — which is why
  both call `buildNinaAvatarEmbedText` rather than either spelling the join. That function is
  **reused as-is, name and all**, despite the word "Avatar": its own header names the failure a
  second spelling causes, and both corpora are now ranked against ONE query vector, so the two texts
  must be built identically or the merged ranking compares apples to a different join.
- **It never throws.** An embedding outage must not cost the prose; `null` writes a NULL vector,
  which is exactly the state `listNinaMessageImageDescribeBacklog` picks up next sweep.
- **It embeds the keywords and never writes them.** `setNinaMessageImageDescriptionAndEmbedding`
  sets two columns and `search_keywords` is not one of them, so the omission is structural — and
  that is what makes `describe: false` the re-earn path after a keyword save: keywords already
  written, vector NULL, recompute from the pair with no vendor image call.
- **`describe: false` leaves a NULL description alone.** An operator who CLEARED the box asked for
  silence, and the embed-only worker must never invent prose to fill it.
- **Prose and vector both present is an authoritative skip** at zero vendor calls, decided inside
  the `after()` against a fresh read — which is what lets every caller schedule unconditionally.

`fillNinaMessageImageDescribeTargets` has **no `after()`**: it is the entry point for a caller
already off the request path that wants the outcome in its own return value, which is phase 4's
Media backfill route. `NINA_MEDIA_BACKFILL_SLICE`/`_BUDGET_MS` are declared here for that route,
ahead of it.

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
`ADMIN_SLOT_VALUE_MAX` (400), `ADMIN_REMINDER_LABEL_MAX` (60) and `ADMIN_REMINDER_MESSAGE_MAX`
(300) — both 2026-09-16, both the same numbers as `NinaReminderWriteSchema`'s in
`lib/nina/schema.ts` — `ADMIN_LEDGER_PAGE` (200), the seven `ADMIN_FACT_CATEGORIES`
(retyped as a tuple with `satisfies` — `NinaFactCategory` is a type union, not a const tuple), and
**`MemoryRow`** — slots, ledger facts, reminders and `pending_promises` entries flattened into the
one serializable shape the table renders, with the fields that carry meaning (`editable`,
`deletable`, `reappears`, `note`). `reappears` is the honest-delete flag: only the closed
vocabulary's slot keys come back as blank rows, and the table has to say so or it reads as a failed
delete. `MemoryRowKind` (the row's `kind` field, `'slot' | 'promise' | 'fact' | 'reminder'`) went
module-private 2026-09-13 — it typed `MemoryRow.kind` in this file and nowhere else;
`SlotEditKind` stays exported, `memoryVocab.ts` imports it.

`memoryVocab.ts` is the only file here that imports `lib/nina/memory.ts`, and only as a READER:
`slotEditKind`, `slotProtection`, `describeSlot`, `canonicaliseSlotValue` (the round trip runs on
the WRITER — a refused value is reported, not converted) and `buildMemoryRows`, the page's
server-side row builder. `buildMemoryRows` emits five bands in one array, in render order: the
closed-vocabulary slot rows, the orphan rows, the reminder rows, the promise rows, the fact rows.
Two things about the reminder band, both 2026-09-16:

- Its input (`reminders`, a `readonly MemoryReminderInputRow[]`) is **optional** — the parameter
  is additive, so every existing caller and test that passes only slots/facts/promises still
  type-checks and still gets no reminder band.
- The orphan filter gained `&& row.key !== NINA_SLOT_REMINDERS`. Without it the `reminders` slot
  renders TWICE: once as its own group, and once as an "unknown key" orphan row holding raw JSON,
  because the reminders key is deliberately not in `NINA_SLOT_KEYS`. A row `kind` is `'reminder'`,
  its `target` is the reminder's id (not a slot key), its `code` carries `timeOfDay`, its `label`
  the label, its `text` the message, and its `note` is `never fired yet` or `last fired <date>`.
  `reappears` is `false` — a deleted reminder is gone, the slot is not a closed vocabulary.

`memoryStore.ts` — `server-only`, the only file naming a phase-1 memory writer
(`adminUpsertSlot`, `adminDeleteSlot`, `adminAppendFact`, `adminUpdateFact`, `adminDeleteFact`,
`adminReadSlot(s)`, `adminReadFacts`). It exists to make one invisible failure impossible: the
underlying writers would default `source` to the distiller's value when omitted, and the
admin-preservation ruling keys off that column — so `AdminFactDraft`/`AdminSlotDraft` simply have
no `source`/`sourceMessageId` field. A caller cannot mislabel a row because there is nowhere to
put the label. It is under `lib/admin/` (not `lib/nina/`) because a test asserts the distiller's
modules do not import the mutating ledger queries.

`memoryActions.ts` — **six** actions since 2026-09-16 (`saveSlotAction`, `insertFactAction`,
`editFactAction`, `createReminderAction`, `editReminderAction`, `deleteMemoryRowAction`), each the
same four lines: `requireAdmin()` first, Zod second, the write through `memoryStore.ts` only,
`revalidatePath` last. There were nine, then four; the five that went were each a second step (a
quoting record before delete, a typed confirmation, a second button after a refusal) and the owner
has ruled: no confirmation whatsoever. The two that came back are R2's add and edit for reminders,
and they are affordances the page did not have, not steps re-added to one it did. Consequences
worth recording:

- `editFactAction` edits ANY ledger row, including distilled ones: the edit sets
  `source = 'admin'`, `source_message_id = NULL` in the same statement, so the row stops claiming
  to be a quotation and the old permissions predicate had nothing left to decide. The row's note
  says the edit makes it his.
- `createReminderAction` (2026-09-16) goes through phase 1's `applyReminderWrites` with a
  single-element `[{ action: 'create', … }]` write list — **not** a hand-rolled push onto the
  array. That is the whole point of it: the `HH:mm` shape check, the four-active cap and the
  same-time-and-label duplicate refusal are one set of rules for an admin-authored reminder and a
  model-authored one. A refusal comes back as `result.refused[0].reason` and is shown verbatim.
  It supplies `todayInJakarta()` and `newId` from the outside, because that function is pure.
- `editReminderAction` (2026-09-16) is the one place the admin path does something the chat path
  cannot: `patchReminder` (`lib/nina/reminders.ts`), a TRUE in-place edit of `timeOfDay` / `label`
  / `message` that leaves `id`, `createdOn`, `lastFiredOn` and `sourceMessageId` untouched. The
  model's only edit mechanism is cancel + create, which mints a new id and forgets that the
  reminder already fired today; this page's precedent for every other row (`saveSlotAction`,
  `editFactAction`) is that the cell you touched changes and nothing else does. `patchReminder`
  runs the same duplicate guard against every OTHER active entry — never against itself, or a
  no-op edit would refuse against its own unchanged row — and reports `{ changed: false,
  refusal: null }` for a genuine no-op, which the action turns into `{ ok: true }` with no write.
- `deleteMemoryRowAction` is the one destructive action and it destroys on the first click;
  `memoryDeleteSchema`'s union makes the four branches exhaustive. A **slot** row is gone but
  the KEY comes back blank (closed vocabulary); a **reminder** is filtered out of the slot's array
  and does not come back; a **promise** entry leaves the slot and does not reappear unless the
  runner states it again; a **fact** is gone for good. No quoting record is written for any of the
  four — the record was the confirmation.
- **Branch ORDER inside `deleteMemoryRowAction` is load-bearing, and the `reminder` branch must
  stay above the promise code.** Only `slot` and `reminder` are written as explicit `if (kind ===
  …)` guards; the promise handling is the *unconditional* final block, reached whenever `kind` is
  neither of those and not `fact`. It returns early ("there are no pending promises" / "no promise
  with that id") whenever the target id is not a promise — which a reminder id never is. Putting
  the reminder branch after it, as the phase plan's prose literally said, makes every reminder
  delete fail with a promise-shaped error while the reminder stays on the page. The plan's own
  parenthetical ("each branch returns before the next begins") is the rule; the ordering is how it
  is satisfied.
- The old "the append comes first, always" two-statement invariant is GONE, deliberately: no
  surviving action writes twice, and the invariant is removed rather than left as folklore.
- `revalidatePath` re-renders the page and is not how the edit reaches Nina — `loadNinaContext`
  reads both tables live every turn.

The consumers outside this package (owned by it): `app/admin/memory/page.tsx` adds one more
`adminReadSlot(target.id, NINA_SLOT_REMINDERS)` to its existing `Promise.all`, runs it through
`parseRemindersSlot` + `activeReminders` (both phase 1's, in `lib/nina/reminders.ts` — cancelled
entries stay in the slot and must not render), and hands the result to `buildMemoryRows`.
`components/admin/MemoryTable.tsx` gains a fourth `GROUPS` entry, **Reminders**, sitting between
Slots and Pending promises; like the ledger group it always renders even when empty, because it
carries its own add row (`ADD_REMINDER_ROW_ID`, `'add:reminder'`, the same not-a-`MemoryRow`
pattern as `'add:fact'`). A reminder row edits three fields, not one — the time and label live in
their own inputs whose drafts follow their props DURING RENDER (the same `lastX` mirror the text
and category drafts use, never an effect), and each commits by sending the whole row to
`editReminderAction`.

### `shortcutModel.ts` / `shortcutStore.ts` / `shortcutActions.ts` — `/admin/shortcuts`

```ts
// shortcutModel.ts — pure, client-safe
export { NINA_SHORTCUT_EXPANSION_MAX, NINA_SHORTCUT_LABEL_MAX, NINA_TRIGGER_MAX } from '@/lib/nina/shortcuts'
export const ADMIN_SHORTCUT_PAGE = 200
export const SHORTCUT_FIELDS = ['trigger', 'label', 'expansion'] as const
export type ShortcutField = (typeof SHORTCUT_FIELDS)[number]
// AdminShortcutKind = NinaShortcutMatchable['kind'] — a TYPE read of phase 1's union, module-private
//   since 2026-09-13 (used only as ShortcutRow/ShortcutSource's `kind` field, never imported)
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
  one file on the server side of the bundle line: the page. `filetree/` is the nearest precedent —
its modules import only `./` siblings, enforced by `tests/admin.filetreeBarrel.test.ts`.
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
   │      contentHashOf(file).catch(() => null)   ← the picked file's own bytes; null is fine
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
             6. if there was no current row, promote one (is_current only)
             7. scheduleDescribeAll(uid, every inserted id)   ← ONE after() for the batch
             8. revalidatePath('/admin/nina')
             9. scheduleAvatarDuplicateScan(after()) over the rows that LANDED,
                excluding the whole chunk — ≤1 duplicate_image push, count to the log
             → { inserted: [{ sourceKey, id }], skipped }
```

Step 9 decides nothing about step 5: the hash rides along so the SERVER can ask whether these
bytes are already in the collection and say so. What lands is still `sourceKey` and its unique
index, because a photo's place in the tree is information the operator put there on purpose.

The vision model appears nowhere on that path's CLOCK. Step 7 runs after the response is finished,
on the `/admin/nina` segment's `maxDuration` (300 s), four lanes wide, against a 240 s start gate;
whatever it does not reach stays NULL and visible in `countNinaAvatarDescribeBacklog` for the
backfill route to finish. The other describes are in-band (the two describe actions) or inside
`after()` (the schedulers in `ninaAlbumDeferredDescribe.ts` and `scheduleChatPhotoCaption`).

### Where each check lives, and why it lives there

| Concern | Client (`filetree/`/`folderOps.ts`) | Route Handler | Server Action |
|---|---|---|---|
| Path normalisation | yes — the mess is here | — | **never** (refuse instead) |
| Path validity | yes | — | yes, as identity against the normaliser |
| Filename / extension | yes | extension vs. declared content type | yes |
| Byte cap | yes (`maxBytes` arg) | enforced by the minted token | yes (`bytes` field) |
| Dedupe (what LANDS) | yes, against the manifest | — | intra-batch, then the unique index |
| Cross-table duplicate (what is TOLD) | hashes the picked file, sends the claim | — | after the commit, in `after()` — never gates a write |
| Folder-op geometry (cycle, merge, depth) | yes (`folderOps` planners) | — | re-checked with the LIVE folder list |
| Current-photo protection | refusal text (`currentPhotoRefusal`) | — | SQL `isCurrent = false` in every delete's WHERE |
| Authorization | — | `requireAdminApi` (401/404) | `requireAdmin` (redirect/404) |
| Crop range | — | — | Zod shape, then `clampCrop` |

## Dependencies

### External

- `zod` — `schema.ts`, `folderOps.ts`, `chatPhotoSchema.ts`, `textModelActions.ts`.
- `@vercel/blob` — `del()` in `ninaAlbumActions.ts` and the media remove path. The `put()` in
  `ninaAlbumAvatarActions.ts` went away on 2026-09-17 with the adoption copy; no action in this
  package mints an object for a promotion any more, and none of them calls `del()` directly —
  every delete path goes through `releaseBlobIfUnreferenced`, and a pointer row makes no blob call
  at all.
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
- `@/lib/nina/reminders` — `parseRemindersSlot`, `applyReminderWrites`, `patchReminder` (and
  `activeReminders` from the page), reached from `memoryActions.ts` alone (2026-09-16). Every one
  of them is pure: this package reads the slot, hands the value in, and writes what comes back.
  The reminder RULES live there and must not be restated here.
- `@/lib/nina/schema` — `NINA_REMINDER_TIME_PATTERN`, the `HH:mm` source string, imported by
  `schema.ts` rather than re-spelled as a second regex.
- `@/lib/date/ranges` — `todayInJakarta()`, supplied to `applyReminderWrites` (which takes the
  day as an argument because it is pure).
- `@/lib/nina/{crop,album,images,vision,caption,memory,shortcuts,attach}` — clamp/bounds, batch
  and manifest caps, the blob prefix, the two model-call families (`describeNinaImages`,
  `captionNinaPhoto`), the slot vocabulary read, the trigger caps and normaliser, the
  photo-param grammar.
- `@/lib/nina/avatarEmbedText` — `buildNinaAvatarEmbedText`, the one combine function, reached from
  `ninaAlbumDeferredDescribe.ts` and (since 2026-09-17) `ninaMediaDeferredDescribe.ts`, and from
  nowhere else. Two callers, one join: the merged search ranks both corpora against one query
  vector, so a second spelling would compare apples to a different join. It is zero-import by
  contract so `scripts/` can load it under `--experimental-strip-types`; adding an import here
  breaks a consumer outside this repo's Next runtime.
- `@/lib/nina/embedding` — `embedNinaText`, the only embedding seam this package touches, reached
  from the two deferred-describe modules alone. It writes its own `nina_error_logs` row, so the
  wrapper here logs a console line and nothing else — and it is passed `userId` deliberately:
  `nina_error_logs.user_id` is nullable, and a row that cannot say whose album it came from is a
  row nobody can act on.
- `@/lib/nina/{imageprefs,imagerecipe,imagetest,imagejobs,imagefail,jobview,sessionResolve,blobRelease}`
  — the image-generation row's bounds and template validator, the daily cap, the test dispatch,
  job reads, the failure-kind vocabulary the test view looks up, the carrier/orphan rules, the
  blob release on remove.
- `@/lib/llm/{catalog,textModel}` — the narrative text model's id list and its store
  (`textModelActions.ts` only).
- `@/lib/photos/{contentHash,globalDuplicate,pointer}` — the dedupe hash and its format gate
  (`chatPhotoActions.ts`, `ninaAlbumUploadActions.ts`), phase 1's cross-table finder
  `findGlobalDuplicatePhoto`, and the `ResolvedPhotoPointer` a hit is expressed as.
- `@/lib/push/duplicateImage` — `notifyDuplicateImagePush`, the second push seam here
  (2026-09-15): the media add (where it REPLACES the generic push), the media replace, and the
  album folder batch's `after()` scan.
- `@/lib/push/send` — `notifyNinaPush`, called by `addChatPhotoAction` and nothing else here, and
  only when the add is not a duplicate. A test's `vi.mock('@/lib/push/send', …)` factory
  must name **all three** runtime exports (`sendNinaPush`, `notifyNinaPush`, `pushNotifier`): the
  module graph reaches it through `lib/nina/proactive.ts`, which imports `pushNotifier`, so an
  omitted key is a module-resolution error rather than a silent undefined.
- `@/lib/id` — `isValidId` shape checks on claimed ids, and `newId` for a reminder's id
  (`memoryActions.ts` passes it in as `applyReminderWrites`' `newId` argument).
- `@/lib/db`, `@/lib/db/schema`, `@/lib/db/queries` — `users.ts` and the memory type imports;
  `isUniqueViolation` (shortcuts' 23505 catch).

`errorLogModel.ts` imports **nothing** — not even a type, which is why `ErrorLogSource` is
declared structurally (see its section). `filetree/`'s modules import only their `./` siblings;
the directory stays import-pure, enforced by `tests/admin.filetreeBarrel.test.ts`.

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
- `app/api/admin/nina/backfill-descriptions/route.ts` (new 2026-09-15) — `requireAdminApi`,
  `AdminForbiddenError`, `forbiddenJson`, and `ninaAlbumDeferredDescribe`'s
  `fillNinaAvatarDescribeTargets` + the two backfill constants. The second `/api/admin` consumer
  of the boundary, and the only importer of the worker that is not an action module.
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

Test consumers — every suite under `tests/` whose name starts `admin.` (27 such files counted
2026-09-15, plus `env.admin`: `admin.avatars`, `admin.filetree`, `admin.filetreeBarrel`,
`admin.folderOps`, `admin.folderActions`, `admin.albumActionsBarrel`,
`admin.albumAvatarActions`, `admin.albumUploadActions`,
`admin.chatPhotos`, `admin.chatPhotoDedupe`, `admin.chatPhotoAdoption`, `admin.memory`,
`admin.memoryActions`, `admin.tuning`, `admin.shortcuts`, `admin.shortcutActions`,
`admin.imagegen`, `admin.imageGenActions`, `admin.imagegenTest`, `admin.photoGrid`,
`admin.photoReference`, `admin.mediaPane`, `admin.requireAdmin`, `admin.settingsActions`,
`admin.shareToNina`, `admin.shell`, `admin.users`), plus the co-located
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
- **`after()`** defers every private scheduler (`scheduleDescribeAll`, `scheduleDescribe`,
  `scheduleEmbed`, `scheduleMediaDescribe`, `scheduleMediaEmbed`, `scheduleChatPhotoCaption`,
  `scheduleAvatarDuplicateScan`) until the response is
  finished. Nothing awaits them, nothing in them revalidates, every failure is swallowed and
  logged. All are synchronous, which a `'use server'` module may not export — so
  `scheduleChatPhotoCaption` and `scheduleAvatarDuplicateScan` stay module-private in the action
  files that use them, and the two describe/embed families, each needed by more than one caller,
  live in the plain `ninaAlbumDeferredDescribe.ts` and `ninaMediaDeferredDescribe.ts` instead.
  The one call that is NOT deferred is `describeChatPhotoAction`'s embed: in band, beside a vision
  call the operator is already waiting on.
- **`after()` runs on the ROUTE SEGMENT's `maxDuration`, not the action's.** That is a runtime
  fact with a cost: `/admin/nina` declares 300 and the deferred worker stops STARTING rows at 240
  so an in-flight describe can land its UPDATE. Deferred work is bounded by a start gate, never
  cancelled mid-call.
- **Four lanes over a shared index, not `Promise.all`.** The batch worker's `next++` is safe
  without a lock (single-threaded, yields only at `await`); the bound exists so a 50-row batch is
  not 50 simultaneous vendor requests.
- **Two backfill workers racing one row is harmless by construction.** The UPDATE is idempotent
  and the backlog read is oldest-first, so a re-POST re-does work, never the wrong work.
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
- **Vendor, blob and push failures are non-fatal and logged** (with distinct log levels for "the
  vendor answered 200 and dropped the image" — the token floor — versus a dead socket). The
  media add's notify is wrapped even though `notifyNinaPush` already swallows its own failures:
  a phone is never allowed to decide whether a photograph was added.
- **A duplicate LOOKUP failure is not a write failure either**, on any of the three upload routes.
  Each cross-table check sits past its own commit inside a `try`/`catch` that only `console.warn`s
  (the folder batch's is per row, so one unreadable row cannot cost the rest of the chunk their
  check). The operator loses the notice, never the photograph.
- **A failed `del` still reports success** after logging: the row is already gone, and a
  recoverable orphan beats a broken image under a live row. The orphan window is named, not
  fixed — the blob reaper owns it, deliberately out of scope here.
- **Refusals are sentences, not field errors**, wherever the sentence is the product: the folder
  merge refusal names both paths and offers the explicit alternative; the current-photo refusal
  names the photo and both ways out.

## Performance

- **The describe pre-pass is off the hot path** (~8–11 s per call), and since 2026-09-15 it covers
  EVERY inserted row rather than one per batch — the cost moved from "one description per upload
  batch" to "one per photograph", all of it inside `after()` and none of it on the operator's
  clock. The bounds are `NINA_DEFERRED_DESCRIBE_CONCURRENCY` (4) and
  `NINA_DEFERRED_DESCRIBE_BUDGET_MS` (240 s under the segment's 300). The image TEST is the one
  long operation on a response path, and it is split into dispatch (returns immediately) and poll.
- **The backlog is a number, not a guess.** `countNinaAvatarDescribeBacklog` is one statement with
  two `FILTER` counts, so "how much is left" costs a single round trip and splits by which half of
  the work (prose, or vector only) is missing.
- **One read per batch, not one per file** (current-row lookup, folder declaration).
- **Promotion copies zero bytes** since 2026-09-17. It used to be a `fetch` plus a `put` of the
  whole object (~100–500 KB per adoption, plus a second Blob object kept for the album row's
  lifetime); it is now one INSERT. The delete side pays for that with one extra single-row
  `getNinaAvatar` and one `countNinaAvatarsLinkedToImage` — both indexed, both on human-paced paths.
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
  Scheduling one inside `after()` for every inserted row is not the same thing and is what the
  album's search requires — the latency argument is about the response, not about the count.
- **Do not write `description` — or `search_keywords` — without deciding about
  `description_embedding`.** Both are inputs to it. Use `setNinaAvatarDescriptionAndEmbedding` /
  `setNinaAvatarSearchKeywordsAndEmbedding` and pass the vector or an explicit `null`; a stale
  vector is the one failure mode a derived column has, and it is invisible until a search returns
  the wrong photograph. `setNinaAvatarDescription` is still correct only where no vector is meant.
- **Do not merge the two edit actions, or the two one-statement writers behind them.** Two boxes
  with two drafts means a merged action drops unsaved keywords on a description save — and a merged
  writer puts a `searchKeywords` parameter within reach of `describeNinaAvatarAction`, which must be
  structurally unable to spell it. The re-describe path READS the column (so the new vector keeps
  the tags) and never writes it.
- **Do not add an import to `lib/nina/avatarEmbedText.ts`,** and do not spell the
  `description + "\n\nKeywords: " + keywords` join anywhere else. Zero imports is what lets
  `scripts/backfill-avatar-embeddings.mjs` load it under `--experimental-strip-types`, and a second
  spelling of the join puts half the album's vectors in a different space with no error anywhere.
- **Do not `scheduleEmbed` a row with no description** after a keywords save. The embedded text is
  anchored on the description and the embed-only worker refuses to describe a NULL one — that row is
  already in the describe backlog, which is where it heals.
- **A projection helper in a test is positional, and there are more copies than you think.**
  `avatarColumns` is a column OBJECT but `fakeDb` rows are arrays, so adding one column to it (here,
  `searchKeywords`, deliberately beside `description`) breaks every hand-written row fixture in
  lockstep. Three independent copies had to move for one column — `lib/nina/queries.test.ts`,
  `tests/admin.albumAvatarActions.test.ts`, and `tests/admin.chatPhotoAdoption.test.ts`'s own
  private `avatarRow`/`describeTargetRow` — and the third was not in the phase plan's file list;
  only the full sweep found it. Grep for the projection's *neighbouring* field names (`cropY`,
  `announcedAt`) across `tests/` and co-located suites before touching a `*Columns` object, and
  never trust a plan's file list as the census.
- **Do not write a MEDIA row's `description` or `search_keywords` without deciding about its
  `description_embedding` either.** Since 2026-09-17 `nina_message_images` carries the vector too;
  use `setNinaMessageImageDescriptionAndEmbedding` /
  `setNinaMessageImageSearchKeywordsAndEmbedding` and pass the vector or an explicit `null`.
  `setNinaMessageImageDescription` remains correct only where no vector is meant.
- **Do not widen `ninaAlbumDeferredDescribe.ts` to cover both tables.** The fork is a witness, not
  a table name: the album worker is hard-coded to `describeSubjectForSide('hers')` because every
  album row is a photograph of her, while the media worker reads `photoSideOf(target.kind)` because
  that table holds both sides. A `kind` parameter would change five signatures so one of them can
  pick a table, and put the wrong-witness defect back within reach.
- **Do not rename or fork `buildNinaAvatarEmbedText` because "Avatar" is in the name.** Both
  corpora are now ranked against ONE query vector, so the two texts must be built identically; a
  second spelling of the join puts half the corpus in a different space with no error anywhere.
- **Do not seed a pointer row's `description` from the media row.** A copied description is exactly
  the second source of truth the link exists to remove. A pointer's prose, keywords and vector stay
  permanently NULL, and the four album prose/keyword actions redirect their writes to the linked
  row — that is the synchronisation, and there is deliberately no other.
- **Do not schedule the ALBUM describe on a pointer row.** `scheduleMediaDescribe(userId, row.id)`
  on the media row is the whole point: the pointer will never carry a vector, so the album worker
  would find a NULL description it must not invent prose for, every time.
- **Do not release a blob for a pointer row, and do not skip `promoteNinaAvatarDependents` for one.**
  Opposite answers to the two steps of the same delete: a pointer minted no object (and asking
  anyway would be a correct question with a wasted answer), but a chat row can re-share it, and
  that FK is `ON DELETE SET NULL` firing inside the DELETE — skipping the promotion mints a ghost.
- **Do not make `removeChatPhotoAction` cascade, and do not move its linked-album check below
  `loadPhotoCarrier` or `promoteNinaImageDependents`.** The FK is `ON DELETE RESTRICT`; the count is
  there to turn the constraint violation into a sentence, and nothing may be measured, promoted or
  deleted on behalf of a remove that is not going to happen.
- **Do not `del()` a blob from an action here.** Every delete path goes through
  `releaseBlobIfUnreferenced` — one object can now sit behind a media row AND an album pointer.
- **Do not guard the keyword redirect on the album row's own `description`.** A pointer's is NULL by
  construction, so the "has prose to re-earn" test must be asked of the LINKED row, and
  `scheduleMediaEmbed` asks it itself inside its `after()`.
- **Do not re-caption after a hand-written edit** — `editChatPhotoDescriptionAction`,
  `editNinaAvatarDescriptionAction`. A hand-written description exists to override the vision
  pass; re-captioning the bubble rewrites a sentence Nina already said. Re-EMBEDDING it is the
  opposite of that and is required: `scheduleEmbed` / `scheduleMediaEmbed`, never the describe
  twin, and never for a cleared box.
- **A wholesale `vi.mock` factory is a CENSUS, and adding an import to an action breaks it
  silently.** `tests/admin.chatPhotos.test.ts` mocks `@/lib/nina/queries` with an explicit-key
  factory: a newly imported query name resolves to `undefined` and every case in the file throws,
  and the failure looks nothing like the change that caused it. That file now needs a second such
  factory for `@/lib/admin/ninaMediaDeferredDescribe`, for exactly the same reason. When you add an
  import to an action, grep `tests/` for factories mocking the module you imported FROM and add the
  key there in the same commit.
- **Do not re-add the `if (avatar.description == null)` guard before a `scheduleDescribe`.** The
  scheduler's own re-read is the authoritative skip (prose + vector = zero vendor calls); a
  caller-side guard cannot see the vector and silently strands adopted chat photos out of the
  search.
- **Do not let `app/admin/nina/page.tsx`'s `maxDuration = 300` become a computed expression, and
  do not delete it.** Segment config is statically analysed: a computed value compiles, ships, and
  leaves the route on the platform default, where the deferred pass is killed after a row or two
  with a 200 already sent and nothing on screen to say so. If that number moves,
  `NINA_DEFERRED_DESCRIBE_BUDGET_MS` moves with it — the 60 s gap is one describe's 25 s plus the
  fallback's 30 s.
- **Do not turn the deadline into a cancellation.** It gates which rows START; a describe that is
  already in flight spends the money whether or not its answer is kept.
- **Do not derive the backfill's `remaining` from its own arithmetic.** Re-read it: an upload's
  `after()` fills rows in parallel, and `remaining` is the operator's loop condition.
- **Keep `.max()` ahead of `.transform()`** in `chatPhotoDescriptionField`, and do not add
  `.min(1)` — the empty box is the clear (D1).
- **Do not draw the media add's caption twice.** One `const body = ninaImageCaption(newId())`
  feeds both the message row and the push; a second call picks a different pool line and the lock
  screen then quotes a sentence the conversation does not contain.
- **Do not move the media add's `notifyNinaPush` above any `{ ok: false }` return.** Its position
  past all four of them is the entire guard that a notification only ever announces a bubble that
  exists — including the refusal that writes a message row and then deletes it.
- **Do not let a push failure change an action's result.** Every notify here is `try`/`catch` →
  `console.warn`, and the action still returns `{ ok: true }`.
- **Do not send two pushes for one event.** A duplicate add SUPPRESSES `admin_chat_photo` and
  sends `duplicate_image` in its place; adding the second push back would double-buzz one gesture.
- **Do not let a duplicate answer gate a write.** Every cross-table check on these three routes
  sits AFTER its commit and only chooses a notification. A deduped replace in particular is a
  defect, not a feature: it would repoint the row at another row's object and strip its provenance
  to a reference, which the collection hides — the photograph the operator can see would vanish.
- **Do not drop `duplicateTargetFromPlan` in favour of "just call the hash lookup".** A duplicate
  row carries the KEEPER's hash, which may legitimately be NULL; the plan's
  `sourceImageId`/`sourceAvatarId` branches are the only answer available for that case, and they
  cost no query.
- **Do not make the album batch's `contentHash` decide what lands.** `sourceKey` and its unique
  index own that; two identical files under two folder paths stay two rows on purpose. The hash
  only feeds the report.
- **Do not narrow the batch scan's exclusion to the asking row.** "Already" means *before this
  drop*, and one drop routinely carries the same picture twice — a per-row exclusion makes each
  copy report the other.
- **Do not turn the batch scan into one push per hit.** Every push shares
  `PUSH_NOTIFICATION_TAG = 'nina'` with `renotify`, so fifty sends redraw one tray entry; the true
  count belongs in the log line. The single-image routes keep one push per duplicate.
- **Do not move the batch scan inline.** Fifty records against a three-table finder is up to 150
  round trips on an action Next dispatches one at a time per client — the stall the batching
  exists to prevent.
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
- **Do not add a confirmation to a memory action either.** Six actions, first-click deletes, and
  `editFactAction` making a row his IS the data-integrity answer (the row stops claiming to quote
  its source message).
- **Do not move the `reminder` branch below the promise block in `deleteMemoryRowAction`,** and do
  not re-implement a reminder rule inside `lib/admin`. The promise block is the unconditional
  fallthrough and will swallow a reminder id; the create path's cap, time grammar and duplicate
  refusal belong to `applyReminderWrites` in `lib/nina/reminders.ts`, which the chat path uses too.
- **Do not let the `reminders` slot key back into the orphan list.** It is deliberately absent
  from `NINA_SLOT_KEYS`, so `buildMemoryRows`' orphan filter has to exclude it by name or the slot
  renders a second time as a raw-JSON "unknown key" row underneath its own group.
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

- **2026-09-17** — `media-album-unified-search` phase 2 of 4 (P2-NIN-A002): the query/action layer
  for one search over both collections. In this package, four movements. **(1) The media collection
  earns a vector.** New `ninaMediaDeferredDescribe.ts` — `embedNinaMessageImageDescription` (the one
  choke point for what a media row's vector is computed from, through the shared
  `buildNinaAvatarEmbedText`), `scheduleMediaDescribe`, `scheduleMediaEmbed`,
  `fillNinaMessageImageDescribeTargets` and the four bounds — a SIBLING of
  `ninaAlbumDeferredDescribe.ts` rather than a widened copy, because the fork is the witness
  (`photoSideOf(kind)` vs hard-coded `'hers'`), not the table. `describeChatPhotoAction` now embeds
  in band and `editChatPhotoDescriptionAction` NULLs the vector in the same UPDATE and re-earns it
  after the response. **(2) Keywords, one table over.** New `chatPhotoKeywordActions.ts` with
  `editNinaMessageImageSearchKeywordsAction` and
  `editNinaMessageImageNegativeSearchKeywordsAction`; new
  `ADMIN_CHAT_PHOTO_MAX_SEARCH_KEYWORDS_CHARS` / `…_NEGATIVE_…` (500 each, siblings of the album's
  and deliberately not imports of them) in `chatPhotos.ts` and their four schemas in
  `chatPhotoSchema.ts`. **(3) Promotion links, it never copies.**
  `copyChatPhotoIntoAlbum` → `linkChatPhotoIntoAlbum` in `ninaAlbumAvatarActions.ts`: one INSERT
  carrying the media row's `blobUrl`/`pathname` plus `sourceImageId`, no `fetch`, no `put`, no
  `description`, and no `try`/`catch` left to wrap a vendor call that no longer happens; the
  promotion now schedules the MEDIA describe. The four album prose/keyword actions in
  `ninaAlbumDescribeActions.ts` branch on `row.sourceImageId` and write the linked media row instead
  (`describeNinaAvatarAction` delegates outright to `describeChatPhotoAction`), which is what makes
  "edit in one place" true without a sync mechanism. **(4) Both halves of the deletion guard.**
  `deleteNinaAvatarAction` reads the row before the DELETE and releases no blob for a pointer while
  still promoting its dependents; `removeChatPhotoAction` calls `countNinaAvatarsLinkedToImage` above
  everything else and refuses with a pluralised sentence rather than letting the `ON DELETE RESTRICT`
  FK surface as an error page. Also: `ninaAlbumSearchActions.ts` moved onto the renamed
  `searchNinaPhotosBy*` family and `AdminSearchHit` gained `origin`, `searchKeywords` and
  `negativeSearchKeywords`, with `searched` now summing both collections. Covered by
  `tests/admin.mediaDescribeEmbed.test.ts`, `tests/admin.mediaKeywords.test.ts`,
  `tests/admin.albumAvatarDelete.test.ts`, `tests/admin.albumDescribeEmbed.test.ts`,
  `tests/admin.albumSearch.test.ts`, `tests/admin.chatPhotoAdoption.test.ts`,
  `tests/admin.chatPhotos.test.ts` and `tests/admin.albumAvatarActions.test.ts`. Phase 4 owns the
  Media backfill route the two `NINA_MEDIA_BACKFILL_*` constants are declared for; the UI phase owns
  the panes that call the keyword actions (nothing outside `lib/admin` imports them yet).

- **2026-09-16** — `nina-natural-reminders` phase 2 of 2 (P1-ADM-R6XQ), satisfying R2 (*"add a
  section to `/admin/memory` so an admin can manually add a new reminder, edit an existing one, or
  remove it — full CRUD, not just delete"*): the `reminders` slot phase 1 introduced stopped being
  chat-only. New **Reminders** group on `/admin/memory`, between Slots and Pending promises, with
  an add row and per-row edit and delete. In this package: `ADMIN_REMINDER_LABEL_MAX` (60) and
  `ADMIN_REMINDER_MESSAGE_MAX` (300) in `memoryModel.ts`, and `'reminder'` added to the private
  `MemoryRowKind`; `reminderCreateSchema` / `reminderEditSchema` in `schema.ts` (one field object
  extended twice) plus a fourth arm on `memoryDeleteSchema`, with the `HH:mm` grammar imported as
  `NINA_REMINDER_TIME_PATTERN` rather than re-spelled; `buildMemoryRows` in `memoryVocab.ts` gained
  an OPTIONAL `reminders` input, a `MemoryReminderInputRow` interface, a reminder band between the
  orphans and the promises, and the orphan-filter exclusion that stops the `reminders` key itself
  rendering as a raw-JSON orphan row; `memoryActions.ts` went from four actions to six with
  `createReminderAction` (through phase 1's `applyReminderWrites`, so the cap, the time check and
  the duplicate refusal are not re-implemented) and `editReminderAction` (through the new
  `patchReminder`), and `deleteMemoryRowAction` gained a `reminder` branch placed ABOVE the
  unconditional promise fallthrough — the phase plan's prose said below, which would have made
  every reminder delete fail with a promise-shaped error (see the gotcha). Outside the package but
  owned by it: one more `adminReadSlot` in `app/admin/memory/page.tsx`' existing `Promise.all`,
  read through `parseRemindersSlot` + `activeReminders`, and the new group plus its three-field row
  editor in `components/admin/MemoryTable.tsx`. The one new function outside `lib/admin` is
  `patchReminder` in `lib/nina/reminders.ts` — a true in-place edit preserving `id`, `createdOn`
  and `lastFiredOn`, which the chat path's cancel+create cannot express. Covered by
  `tests/admin.memory.test.ts` and `tests/nina.reminders.test.ts`; `npm run typecheck`, `npm run
  lint` and the full `npx vitest run` (357 files / 6225 tests) green.

- **2026-09-15** — `nina-album-search-relevance-tools` phase 2 of 3 (P1-ADM-T8RM), satisfying R2
  (*"kalo selain image description, kita tambah satu field baru, search_keywords"*): the album's
  vector gained a SECOND input. `nina_avatars.search_keywords` is a nullable text column (migration
  `0024_nina_avatar_search_keywords`, applied to production this session; drift guard green), and the
  new zero-import `lib/nina/avatarEmbedText.ts` holds the single combine function
  (`buildNinaAvatarEmbedText` + `NINA_AVATAR_KEYWORDS_PREFIX`) every runtime embeds through. In this
  package: `ADMIN_AVATAR_MAX_SEARCH_KEYWORDS_CHARS` (500, derived from the embed ceiling) in
  `avatars.ts`; `avatarSearchKeywordsField`/`avatarSearchKeywordsSchema` in `schema.ts` (whitespace
  folds to one space — it is a LINE, not a paragraph); a sixteenth action
  `editNinaAvatarSearchKeywordsAction` in `ninaAlbumDescribeActions.ts`, writing the column and a
  NULL vector in one UPDATE (`setNinaAvatarSearchKeywordsAndEmbedding`) and re-earning the vector via
  `scheduleEmbed`, but only for a row that has prose; `embedNinaAvatarDescription` grew a positional
  `searchKeywords` parameter and `NinaAvatarDescribeTarget` the matching field, so the deferred
  worker reads the keywords in its existing one-statement batch read and still cannot write them;
  and `describeNinaAvatarAction` now READS `row.searchKeywords` into the new vector while remaining
  structurally unable to overwrite it. `avatarColumns` gained `searchKeywords` beside `description`,
  which moved three independent positional row fixtures in the tests (see the gotcha — the third was
  not in the plan's file list). UI: a "Search keywords" box beside the description in
  `PhotoDescription.tsx`/`SelectionPane.tsx`, `AlbumExplorerPhoto.searchKeywords`, and the one
  additive row→prop line in `app/admin/nina/page.tsx`. New `npm run nina:backfill-embeddings`
  (`scripts/backfill-avatar-embeddings.mjs`), run for real: 53/53 rows re-embedded, 0 failed (counts
  measured 2026-09-15). Covered by `tests/admin.albumAvatarActions.test.ts`,
  `tests/admin.albumDescribeEmbed.test.ts`, `tests/admin.albumActionsBarrel.test.ts`,
  `tests/nina.avatarSearch.test.ts`, `tests/db.schema.nina.test.ts` and the explorer's co-located
  suites. Phases 1 and 3 of that plan set are peer phases in the same worktree and are deliberately
  not documented here.
- **2026-09-15** — `admin-album-semantic-search` phase 2 (P2-ADM-A001), satisfying R2's other half
  (*"semantic search over EVERY image description we have"*): the album's write side now keeps
  `description` and `description_embedding` in step. `ninaAlbumDeferredDescribe.ts` was rewritten
  from a one-row scheduler into a describe-**and-embed** worker — three schedulers
  (`scheduleDescribeAll`, `scheduleDescribe`, `scheduleEmbed`), a four-lane runner
  (`NINA_DEFERRED_DESCRIBE_CONCURRENCY`), a 240 s START gate under the segment's new 300 s
  `maxDuration` (`NINA_DEFERRED_DESCRIBE_BUDGET_MS`), a never-throwing
  `embedNinaAvatarDescription`, and `fillNinaAvatarDescribeTargets` for a caller already off the
  request path. `registerNinaAvatarsAction` now schedules **every inserted row** in one `after()`
  instead of `rows[0]` only; `setChatPhotoAsAvatarAction` dropped its `description == null` guard
  (an adopted chat photo arrives with prose and never a vector, so the guard stranded it out of
  the search); `describeNinaAvatarAction` embeds in band; `editNinaAvatarDescriptionAction` writes
  the new prose with a NULL vector in ONE statement and re-earns the vector in `after()`. Every
  write goes through the new `setNinaAvatarDescriptionAndEmbedding` (`lib/nina/queries/avatarEmbeddings.ts`,
  with `listNinaAvatarDescribeTargets`, `listNinaAvatarDescribeBacklog` and
  `countNinaAvatarDescribeBacklog`, re-exported from the `lib/nina/queries` barrel).
  `app/api/admin/nina/backfill-descriptions/route.ts` is new: a `requireAdminApi()`-gated
  `GET` (count) / `POST` (one slice, re-read `remaining`) the operator loops once over the album
  that existed before this feature. `app/admin/nina/page.tsx` gained `export const maxDuration =
  300`, because `after()` inherits the route segment's budget and not the action's. Covered by
  `tests/admin.albumDescribeEmbed.test.ts` (16 tests, measured 2026-09-15) plus updates to
  `tests/admin.albumAvatarActions.test.ts` and `tests/admin.chatPhotoAdoption.test.ts`. Phases 3
  and 4 of that plan set are peer phases in flight in the same worktree (the read side, and the
  `/admin/nina` UI); phase 3's own entry is below.
- **2026-09-15** — `admin-album-semantic-search` phase 3 (P2-NIN-A001), satisfying R2/R3/R4
  (*"semantic search over every image description"*, *"search using image only"*, *"resolve the
  scoring between these 2"*): the album gained a read side. `lib/admin/ninaAlbumSearchSchema.ts`
  (payload shape and the two ceilings) and `lib/admin/ninaAlbumSearchActions.ts` (one
  `requireAdmin()`-gated `searchNinaAvatarsAction`) are new; `ninaAlbumActions.ts` gained the three
  result types (`AdminSearchMode`, `AdminSearchHit`, `AdminSearchResult`) and the action's
  re-export, for the reason `AdminActionResult` already lives there. The ranking itself is
  `lib/nina/queries/avatarsearch.ts` — this package captions, embeds and gates; it does not rank.
  Covered by `tests/admin.albumSearch.test.ts` and the barrel test's added names. The other phases
  of that plan set are peer phases in flight in the same worktree (the describe/backfill write side
  and the `/admin/nina` UI) and are deliberately not documented here.
- **2026-09-15** — `dup-image-push-notify` phase 4 of 4 (P1-ADM-L2VN), *"wire the admin-side
  upload routes"*, satisfying R1 on the three routes this package owns. `addChatPhotoAction` now
  asks the duplicate question twice-in-order — `duplicateTargetFromPlan(plan)` first (free, exact,
  and the only answer possible when the keeper's own `content_hash` is NULL), then phase 1's
  cross-table `findGlobalDuplicatePhoto` for a genuinely fresh original, excluding the row just
  inserted — and a hit SUPPRESSES the pre-existing unconditional `admin_chat_photo` push in favour
  of a `duplicate_image` one: still exactly one push per successful add, still none on any of the
  four refusal paths. `replaceChatPhotoAction` hoisted its `isValidContentHash` normalisation to a
  `const claimedHash` (needed twice now) and asks the same question after the commit, purely
  informationally — the byte swap is never gated on the answer. The album folder batch grew the
  claim end to end: `useFolderUpload.ts` hashes the picked file (this path PUTs it unmodified, so
  the file's bytes are the stored bytes), `avatarBatchRecordSchema` carries it as `nullish`
  (shape only; the format gate is the action's), `NinaAvatarBatchInsert`/`insertNinaAvatars` write
  the new `content_hash` column, and `registerNinaAvatarsAction` schedules an `after()` scan over
  the rows that ACTUALLY landed (`RETURNING` after `ON CONFLICT DO NOTHING`), joined to their
  hashes by `pathname`, with the WHOLE chunk excluded — at most one `duplicate_image` push per
  chunk (ratified by the plan-set reconciler: every push shares one `PUSH_NOTIFICATION_TAG =
  'nina'` with `renotify`, so N sends already collapse to one visible notification), the true hit
  count to the log, and a re-dropped folder scheduling nothing at all. **No dedup DECISION changed
  anywhere**: keeper choice, reference rows and blob-release timing are byte-identical. New suite
  `tests/admin.albumUploadActions.test.ts` — the plan believed `registerNinaAvatarsAction` had no
  behavioural test, but `tests/admin.albumAvatarActions.test.ts` already covers it end to end via
  `fakeDb`; that suite's `batchRecord()` fixture carries no `contentHash`, so it never reaches the
  new scan and the new file is genuine, non-redundant coverage rather than a second copy.
  `tests/admin.chatPhotos.test.ts` and `components/admin/explorer/useFolderUpload.test.tsx` grew
  the add/replace and hashing cases. Phases 2–3 of that plan set are peer phases in flight in the
  same worktree and are deliberately not documented here.
- **2026-09-14** — `nina-push-every-message` phase 4 (P1-ADM-A003), satisfying R2 *"when Nina
  speaks on her own initiative, a push notification is sent"*: `addChatPhotoAction` now calls
  `notifyNinaPush(userId, [{ id: message.id, body }], 'admin_chat_photo')` after
  `scheduleChatPhotoCaption` and before `revalidatePath`, past all four `{ ok: false }` returns
  and inside a log-only `try`/`catch`. The bubble's caption became a `const body` written once
  into the row and read again for the notification, replacing a second `ninaImageCaption(newId())`
  draw — the row and the push now carry the same string by construction. Adding a photo from
  `/admin` buzzes the phone with the bubble's own line; refusals push nothing; a notify failure
  costs neither the row nor the deferred caption. `tests/admin.chatPhotos.test.ts` gained a
  whole-module `vi.mock('@/lib/push/send', …)` naming all three runtime exports plus a 7-case
  `addChatPhotoAction tells his phone (R2)` block (90 tests in that file, full suite 5824 green
  with no `VAPID_*` set — both counts measured 2026-09-14). The other four phases of that plan set
  are peer phases in flight in the same worktree (`lib/nina`, `scripts/nina-image-worker`) and are
  deliberately not documented here.
- **2026-09-13** — dead-export sweep (token-maxxing session `lib-admin-yagni`): a knip
  `exports`/`types` pass flagged 26 items across `schema.ts`, `folderOps.ts`, `chatPhotoSchema.ts`,
  `chatPhotos.ts`, `memoryModel.ts` and `shortcutModel.ts` — every one verified by grep against
  `app/ components/ lib/ tests/` before touching it (a `.workflows/` plan-doc mention is not a
  reader). 18 `z.infer`/derived type aliases with no importer anywhere were deleted outright
  (`CropWrite`, `AvatarDescriptionInput`, `AvatarRegister`, `SlotEdit`, `FactInsert`, `FactEdit`,
  `MemoryDelete`, `AvatarBatchRegister`, `AlbumManifestRequest`, `ShortcutInsert`, `ShortcutCell`,
  `ShortcutToggle`, `ShortcutDelete`, `ChatPhotoAddInput`, `ChatPhotoReplaceInput`,
  `ChatPhotoRemoveInput`, `ChatPhotoDescribeInput`, `ChatPhotoDescriptionInput`); 8 schema consts
  and vocabulary types still used *inside* their own file lost only their `export` keyword
  (`userIdSchema`, `slotKeySchema`, `sourceKeySchema`, `avatarBatchRecordSchema`,
  `ADMIN_FOLDER_OP_MAX_IDS`, `ADMIN_CHAT_PHOTO_PURPOSE`, `ADMIN_CHAT_PHOTO_EXT`,
  `ADMIN_CHAT_PHOTO_ID_RE`, `ADMIN_CHAT_PHOTO_STORED_ID_RE`, `MemoryRowKind`, `AdminShortcutKind`
  — an unused *export* is not the same claim as an unused *value*). `AvatarBatchRecord`,
  `ChatPhotoSetAvatarInput` and `SlotEditKind` were flagged similarly-named but are NOT in this
  list: each has a live external reader (`useFolderUpload.ts`, a test, `memoryVocab.ts`) and knip
  did not flag them. `npx knip --include exports,types` reports zero remaining flags under
  `lib/admin/`; `npx tsc --noEmit` and the full `vitest run` are clean (one pre-existing flake
  under parallel load, passing in isolation — unrelated, a React 19 transition-settle timing issue
  named in this repo's own engineering memory). No runtime behaviour changed: every edit either
  deleted a type nothing referenced or removed an `export` keyword from a value still used in the
  same module.
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
