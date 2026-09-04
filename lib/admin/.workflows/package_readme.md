# Package: admin

**Location**: `lib/admin`
**Last Updated**: 2026-09-04

## Overview

`lib/admin` is everything behind `/admin/**`: the authorization boundary itself, the two admin
surfaces' Server Actions (`/admin/nina`, the album and file manager; `/admin/memory`, Nina's
persistent memory), the Zod schemas that validate every byte those actions accept from a browser,
and one zero-import pure library (`filetree.ts`) that the client half of the file manager shares
verbatim with the server half.

It is a *boundary-plus-actions* package. Nothing in it is a general utility: every export exists
because one admin screen needs it, and the package's organising rule is that a value with two
readers has exactly one definition — `lib/admin/avatars.ts`'s header states it outright
(*"a constant that is agreed rather than shared is a constant that will one day disagree"*), and
`schema.ts` obeys it literally by importing every bound it enforces rather than re-spelling any.

**Key Responsibilities:**

- Be the actual authorization boundary for `/admin/**`. `proxy.ts` matches neither `/admin` nor
  `/api/*` (ruling D3), so `requireAdmin()` / `requireAdminApi()` are the only thing between a
  signed-in stranger and Nina's album.
- Validate every admin input at the boundary with Zod, importing each bound from the module that
  owns it.
- Own the album's write side: register, promote, crop, delete, describe, and batch-register a
  dropped folder.
- Own `/admin/memory`'s write side, and make it structurally impossible to write a memory row
  without the `admin` source label.
- Decide a folder upload — walk, classify, refuse, diff against the manifest — in one pure,
  import-free module that a `'use client'` explorer can import.

## Module map

| File | Environment | Purpose |
|---|---|---|
| `requireAdmin.ts` | `server-only` | The boundary. Page/action flavour, Route Handler flavour, canonical refusal body. |
| `avatars.ts` | pure (one constant import) | Blob pathname shapes, content types, size caps, id regex, TTLs — original and thumbnail. |
| `filetree.ts` | pure, **zero imports** | Folder-path grammar, file classification, dedupe key, `planFolderUpload`, tree building. |
| `schema.ts` | pure | Every Zod schema `/admin/**` accepts. Imports every bound; declares none. |
| `ninaAlbumActions.ts` | `'use server'` | The album's write side and the folder-upload register. |
| `users.ts` | `server-only` | The unscoped account enumeration `/admin/memory`'s picker needs. |
| `memoryModel.ts` | pure | Memory bounds, categories, card shapes, permission and composition helpers. |
| `memoryVocab.ts` | pure | The bridge from phase 5's closed slot vocabulary to `/admin/memory`'s cards. |
| `memoryStore.ts` | `server-only` | The only file naming a phase-1 memory writer; forces the `admin` label. |
| `memoryActions.ts` | `'use server'` | The eight memory Server Actions. |

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
throw a framework control-flow error, so the same two rules as `requireUserId()` apply: call it
FIRST, and never wrap it in a bare try/catch.

The two refusals are deliberately different answers:

- **No session → `redirect('/')`.** `/` is the sign-in screen (R-24), so signing in is the useful
  next step.
- **Session whose email is not an admin → `notFound()`.** Signing in again will not help, and a
  404 tells a signed-in stranger nothing: `/admin/nina` and `/admin/nonsense` answer identically.
  `forbidden()` was rejected because it is behind Next's experimental `authInterrupts` flag.

`getAdminIdentity()` is the branch-don't-refuse flavour; `requireAdminApi()` is the Route Handler
flavour that throws `UnauthorizedError` (401, F02's class, imported rather than redefined) or
`AdminForbiddenError` (404) so one catch serves both.

### `avatars.ts` — where a blob lives and how big it may get

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
export function isAdminAvatarRequestPathname(pathname, userId): boolean
export function isAdminAvatarThumbRequestPathname(pathname, userId): boolean
```

`NINA_BLOB_PREFIX` is imported from `lib/nina/images.ts` rather than re-declared (ruling A6), so
the store layout has one spelling.

**Two pathname shapes, two predicates, two caps.** The original keeps its source container —
`nina/<userId>/avatar-<id>.<ext>` — because this page never re-encodes it (a 4x crop zoom on a
downscaled source shows her face at 192 px). The derived thumbnail is
`nina/<userId>/thumb-<id>.<ext>`, **carrying the AVATAR's id rather than a fresh one**, which is
what makes an orphaned thumbnail findable later. The `ext` argument is required and not defaulted,
because the Route Handler cross-checks a pathname's extension against the declared content type.

The predicates are two functions and not one widened alternation on purpose: the caller needs to
know WHICH shape it was handed, because the two carry different `maximumSizeInBytes` (8 MB vs.
512 KB), and a 512 KB rule that silently becomes an 8 MB rule is the mistake worth making
structurally impossible. Both refuse a user id that is not id-shaped rather than interpolating it
into a regex.

The request regex and the stored pathname are deliberately different shapes: `addRandomSuffix: true`
means Blob rewrites what it was asked for, so only the request half is enforceable and
`thumb_pathname` has to be a column rather than a computation.

### `filetree.ts` — the file manager's decisions, before anything touches the network

**This module has no imports at all, and must not acquire one.** Its readers are a `'use client'`
explorer, a `'use server'` action module, a Route Handler and the unit suite; one server-side
import and the client half stops compiling. In particular, do not import `avatars.ts` for the byte
cap — `planFolderUpload` takes `maxBytes` as an argument precisely so the cap keeps one home.

Bounds and grammar:

```ts
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
```

`NINA_FOLDER_FORBIDDEN_RE` is a DENY list matched unanchored — the test is `!RE.test(value)` — and
it deliberately has no `g` flag, because a global regex reused with `.test` carries `lastIndex` and
starts answering `false` to input it just rejected. That is what makes it safe to share between a
loop here and a `.refine()` in `schema.ts`.

Path functions: `normaliseFolderPath`, `validateFolderPath`, `foldFolderPath`, `splitFolderPath`,
`folderDepth`, `folderName`, `folderParent`, `joinFolderPath`, `folderAncestors`,
`folderBreadcrumbs`, `isFolderAncestorOf`, `isInFolderTree`, `sanitiseFolderSegment`.

File functions: `fileExtension`, `classifyFile` (`FileVerdict` / `FileRejection`), `sourceKeyFor`.

Planning and tree: `planFolderUpload`, `folderCounts`, `buildTree`, `findFolderNode`.

```ts
export function planFolderUpload<T extends LocalFileLike>(input: {
  base: string
  files: readonly T[]
  manifest: readonly ManifestEntryLike[]
  maxBytes: number
}): FolderUploadPlan<T>
```

Partitions a walked folder into four buckets — `upload`, `existing`, `rejected`, `refused` — plus
`folders` and `counts`. The per-file order of checks is load-bearing: **name → kind → shape →
bytes → novelty**. `classifyFile` runs ahead of the path and size checks so that a `Thumbs.db`
nine folders deep reads as "not an image" (silently swallowed) rather than "too deep" (reported),
which would tell the operator his tree is malformed when it is merely ordinary.

`base` is the folder the drop landed in. The same folder dropped at the root and inside `Faces` is
genuinely two different sets of files, so a diff that ignored `base` would report the second as
already uploaded.

Rejections are returned, never thrown, and no ordering of the input is assumed or imposed.
Sorting uses plain `<`/`>` on the folded form rather than `localeCompare`, because `localeCompare`
with no locale argument reads the host's and the unit suite could not assert an order at all. The
consequence is lexicographic rather than natural order (`Folder 10` before `Folder 2`) — a known,
filed limitation.

`folders` lists only the folders `upload`'s rows will bring into existence. **An empty directory in
a dropped tree appears nowhere**: a drop hands over a flat list of FILES, so a browser never
mentions it. Empty folders themselves are durable (`nina_folders`), but only *"New subfolder"* can
create one.

### `schema.ts` — the boundary's Zod layer

```ts
export const avatarIdSchema
export const cropWriteSchema            // type CropWrite
export const avatarRegisterSchema       // type AvatarRegister — the singular upload
export const userIdSchema
export const slotKeySchema
export const slotEditSchema             // type SlotEdit
export const slotRetireSchema
export const promiseRemoveSchema
export const factInsertSchema           // type FactInsert
export const factEditSchema             // type FactEdit
export const factRetractSchema          // type FactRetract
export const factPurgeSchema

// the folder-aware upload boundary
export const folderPathSchema
export const albumFilenameSchema
export const sourceKeySchema
export const avatarBatchRecordSchema    // type AvatarBatchRecord
export const avatarBatchRegisterSchema  // type AvatarBatchRegister
export const albumManifestSchema        // type AlbumManifestRequest
```

**Every bound here is imported, none is declared.** `NINA_FOLDER_MAX_PATH_CHARS`,
`NINA_FILENAME_MAX_CHARS`, `NINA_SOURCE_KEY_MAX_CHARS`, `NINA_FOLDER_FORBIDDEN_RE` and
`NINA_FOLDER_SEPARATOR` come from `filetree.ts`; `NINA_ADMIN_BATCH_MAX` from `lib/nina/album.ts`;
the crop range from `lib/nina/crop.ts`; the blob bounds from `avatars.ts`; the memory bounds from
`memoryModel.ts`.

#### Two layers of bounds, and why both

Zod cannot know an image's aspect ratio, so `cropWriteSchema` enforces the SHAPE (integer, within
an absolute ceiling no legitimate crop can exceed) and the Server Action re-runs `clampCrop`
against the row's real `width`/`height`. Neither alone is sufficient: a schema cannot know the
aspect ratio, and a clamp cannot reject `scale: "banana"`.

#### `folderPathSchema` validates a canonical path. It does not normalise one.

It is **not a second regex** — it wraps `validateFolderPath` from `filetree.ts`, the repo's one
folder-path grammar, and adds the identity comparison that turns a normaliser into a validator:

```ts
const result = validateFolderPath(value)
return result.ok && result.path === value
```

`validateFolderPath` normalises before it judges, which is exactly right on the client and exactly
wrong as a server's only check: on its own it would ACCEPT `/Nina`, `Nina/`, `Nina//2026`,
`Nina\2026` and `"trip "` by quietly rewriting them. Normalisation belongs in the BROWSER, before a
single byte is PUT, because that is where the diff is computed and where the mess actually is.

Silently rewriting here would be the worse failure, and the invisible kind: the row would land in a
folder the client does not believe it asked for, its dedupe key — derived from the path it *did*
ask for — would be stored against it, and every later diff would compare a key from path A against
a row sitting at path B. Forever, and only for the paths that needed rewriting. A refusal is a bug
in the caller and shows up the first time it runs.

`''` (the album root) is VALID: every pre-F34 row has it by column DEFAULT, and it is still where
the singular upload path lands. `.max()` runs before `.refine()` so a megabyte of string is
rejected before it is split into a million segments.

#### `albumFilenameSchema` is not `folderPathSchema` applied to one segment

The two have different length bounds, deliberately. A folder segment is capped at 64 because a
human typed it and a tree pane has to render it; a filename is capped at 200 because it came off a
disk — `IMG_20240817_101112_BURST003_COVER_TOP.jpg` is a real camera filename and refusing it would
refuse the operator's own photographs.

Three refusals sit on top of the shared character class:

- **`/` explicitly.** `NINA_FOLDER_FORBIDDEN_RE` forbids `\` and not `/`, because in `filetree.ts`
  the forward slash is the separator and has already been split on. Here nothing has split it, so
  `Bali/IMG_1.jpg` would otherwise pass — a filename carrying a path is exactly the client bug this
  catches.
- **Trailing space and trailing dot.** Win32 silently strips both, so `"beach "` and `"beach"` are
  one file on the machine the upload came from and would be two rows here.
- **`.` and `..`** by name.

#### `sourceKeySchema` — the dedupe key as a shape

Its derivation is `filetree.ts`'s `sourceKeyFor`: `(normalised relative path, size, lastModified)`
folded into one string, because a browser reads all three off a `File` for free and hashing
hundreds of megabytes to answer "have I seen this?" costs more than the upload it saves.

The exclusion is `\p{Cc}` and not a positive character class, matching the deny-list posture: a
folder called `naïve` must round-trip. The 800-character cap is a STORAGE bound, not taste —
`(user_id, source_key)` is a unique b-tree index and a b-tree tuple cannot exceed ~2704 bytes, so
an unbounded client string there is an `INSERT` that fails inside Postgres at some unpredictable
path length instead of failing validation at the boundary. The computed worst case is 745.

#### `avatarBatchRecordSchema` / `avatarBatchRegisterSchema`

A record's six blob fields are spelled exactly as `avatarRegisterSchema` spells them and bounded by
the same constants — a record that passes here and would fail there is a record that means two
things. There is no `makeCurrent`: a folder upload never makes three hundred photos her face.

`thumb` is a nullable OBJECT (`{ url, pathname }`) rather than two loose columns, so "has a
thumbnail" cannot be half-true. **Nullable is deliberate**: if the browser's canvas encode fails
for one file out of three hundred, the ORIGINAL has already been PUT, and refusing the row would
throw away a completed upload and orphan its blob to save a 20 KB optimisation. A tile falls back
to `blobUrl` when `thumbUrl` is NULL, which every pre-F34 row needs anyway. No thumbnail
`width`/`height`/`bytes`: nothing reads them, and the only bound a thumbnail needs is enforced by
Blob at PUT time via the Route Handler's token, not by a number a client reported afterwards.

The envelope is an object holding one array rather than a bare array, so a future field is an
additive change. The `NINA_ADMIN_BATCH_MAX` (50) cap has three independent justifications: parameter
count and blast radius (a failed request loses one chunk, not the upload); the 1 MB Server Action
body cap, against which a ~450-byte record leaves two orders of magnitude of margin; and
`insertNinaAvatars` throwing above that number — this is the check that makes that throw
unreachable.

**All-or-nothing at the schema boundary, on purpose.** One bad record fails the whole call, because
`planFolderUpload` has already partitioned the walk before anything was PUT and the client only
submits records whose blob landed. So a record that fails this schema is not user data — it is a
bug in the client, and a partial-success path would let that bug write half a batch and stay
invisible. Per-file refusals belong on the client, beside the file's name.

### `ninaAlbumActions.ts` — the album's write side

```ts
export interface AdminActionResult { ok: boolean; error?: string; id?: string; description?: string }
export interface AdminManifestEntry { id: string; folder: string; sourceKey: string }
export interface AdminBatchRegisterResult extends AdminActionResult {
  inserted?: { sourceKey: string; id: string }[]
  skipped?: number
}
export interface AdminManifestResult extends AdminActionResult {
  entries?: AdminManifestEntry[]
  truncated?: boolean
}

export async function describeNinaAvatarAction(rawId: string): Promise<AdminActionResult>
export async function registerNinaAvatarAction(input: unknown): Promise<AdminActionResult>
export async function setCurrentNinaAvatarAction(rawId: string): Promise<AdminActionResult>
export async function saveNinaAvatarCropAction(input: unknown): Promise<AdminActionResult>
export async function deleteNinaAvatarAction(rawId: string): Promise<AdminActionResult>
export async function ensureNinaAvatarDescriptionAction(rawId: string): Promise<AdminActionResult>
export async function registerNinaAvatarsAction(input: unknown): Promise<AdminBatchRegisterResult>
export async function listNinaAlbumManifestAction(input: unknown): Promise<AdminManifestResult>
```

Every action opens with `requireAdmin()` and is scoped to the id it returns.

**What this file does not do**: it writes no `nina_messages` row and composes no line of Nina's
dialogue (a new current avatar is left with `announced_at = NULL` for the `avatar_changed`
trigger); it does not touch `assets/nina/_anchor.png` (a committed repo file on a read-only
serverless filesystem); and it generates nothing.

#### The describe pre-pass is OFF the upload path

It used to be awaited on every single upload, and that was correct at F33's scale: an uploaded
image has no generation prompt, so a vision model is the only way `nina_avatars.description` ever
gets filled. What changed is the scale — *"i will put hundreds of profile pics in there"*.

A describe call is ~8-11 s typical. Awaited once per upload, three hundred uploads is 40 minutes to
1.4 hours of wall clock the operator sits through, three hundred serverless invocations held open,
and three hundred vendor bills — for photographs Nina may never be shown. Server Actions dispatch
one at a time per client, so those latencies do not overlap; they add.

`description` has exactly one reader — her prompt — so it is now produced at exactly the two
moments it is needed:

- **It becomes her face**: `setCurrentNinaAvatarAction`, plus the two paths that make a row current
  without going through it (`registerNinaAvatarAction` with `makeCurrent`, and the batch's
  empty-album promotion).
- **It is handed to her**: the share-to-Nina path, via `ensureNinaAvatarDescriptionAction`.

Plus on demand, forever, via `describeNinaAvatarAction` — the button that was always there.

Within this package `describeNinaImages` therefore has exactly two call sites,
`describeNinaAvatarAction` and the private `scheduleDescribe`, and **neither is on a register
path**: no vision call happens on any upload.

Both automatic triggers are non-fatal, exactly as the old pre-pass was. What is knowingly given up:
a photo uploaded and never promoted or shared has `description = null` indefinitely — which is
precisely why the share path fires the ensure before opening the chat tab.

`scheduleDescribe(userId, id)` is module-private (a `'use server'` module may export only async
functions, and this is a synchronous scheduler). It uses `after()` rather than `await` — the repo's
idiom for a second model call the caller must not wait on — and re-reads the row inside the
callback so the caller pays nothing and the "already described, skip the vendor call" test is
authoritative at the moment the work would run. It deliberately does not call `revalidatePath`:
`after()` runs once the response is finished, so there is no re-render left to attach to, and
`/admin/nina` is `force-dynamic` anyway. `ensureNinaAvatarDescriptionAction` is the in-band variant
for a caller that needs the prose in its own return value; it delegates to `describeNinaAvatarAction`
rather than repeating its body, because two spellings of one vendor call is how one of them ends up
not writing the row.

#### `registerNinaAvatarAction` — the singular path

Still the only writer on the one-file-at-a-time path (`onUploadCompleted` is inert). It lands rows
at the album ROOT: it says nothing about `folder`, `filename` or `source_key`, and the
`folder text NOT NULL DEFAULT ''` column is what makes that a legal row. A row it writes has no
`source_key`, so it is invisible to the manifest diff.

`makeCurrent: false` still goes through `insertNinaAvatarAsCurrent` and then hands the crown back —
two statements instead of one, on an operation a human performs a handful of times a year, in
exchange for not writing a second insert path that could disagree about the partial unique index.

#### `registerNinaAvatarsAction` — the batch path

Registers a whole chunk of a folder upload in ONE action call. The split it embodies: **parallel
bytes, batched bookkeeping.** The blob PUTs go through the Route Handler and genuinely run in
parallel under the client's bounded-concurrency queue; Server Actions do not, so the bookkeeping
batches at `NINA_ADMIN_BATCH_MAX`.

It uses `insertNinaAvatars`, not `insertNinaAvatarAsCurrent`, because the latter un-currents and
re-currents on every insert (the partial unique index makes the statement order load-bearing).
Three hundred calls would rewrite the current row three hundred times, re-arm `announced_at` three
hundred times, and make her comment on a face nobody chose. `insertNinaAvatars` writes
`isCurrent: false` for every row and never reads that column.

**Idempotence is a constraint, not a convention.** `insertNinaAvatars` is
`ON CONFLICT (user_id, source_key) DO NOTHING ... RETURNING`, so the array it returns holds only
genuinely new rows. A re-sent batch — a retry after a network blip, a double-clicked drop, the same
folder dragged in twice, two tabs — returns `[]` and writes nothing. Nothing is compared in
application code and nothing races: the unique index decides, and `skipped` is
`submitted - rows.length`. The intra-batch dedupe (first writer wins, on the key) is separate and
deliberate: two records with the same key inside one `VALUES` list is a client bug, and dropping
the duplicate here beats depending on how Postgres resolves a speculative-insertion conflict
against a tuple from the same command.

**`declareNinaFolders` runs once per batch, BEFORE the insert.** Once, not per file — the batch's
folders are collected through a `Set`, and the root is filtered inside `declareNinaFolders`, so a
batch of root-level files passes `['']` and writes nothing. It is `ON CONFLICT DO NOTHING` on the
composite primary key, so it costs one statement and never conflicts. Without it a dropped folder
would still appear (the folder listing UNIONs the photograph rows in) but would silently cease to
exist the moment its last photograph was removed. Before the insert, because if the insert throws,
a declared-but-empty folder is a harmless and now-legal leftover the operator can see and delete —
where the reverse order would leave photographs in a folder nothing declared.

**`is_current` is touched in exactly one case.** If the album has no current row at all (a fresh
database, before any seed), a plain batch insert would leave it with none, and "exactly one current
avatar, always" is invariant 7. So the current row is read ONCE per batch — a single-row lookup on
the partial unique index, not once per file — and only if it was absent is one inserted row
promoted through `setCurrentNinaAvatar`, the function that owns the un-current/current ordering, so
this path adds no third opinion about that index.

The result joins on `pathname` and not on `sourceKey`, because `sourceKey` is deliberately not on
`NinaAvatarRow`. `pathname` is the STORED Blob pathname (`addRandomSuffix: true` plus
`allowOverwrite: false` make it unique per object) and is the same string the client already holds.
Array position would work today and is not used, because "the order `RETURNING` gives back after
skipping conflicts" is not a promise worth depending on.

#### `deleteNinaAvatarAction` — row first, blob second, and TWO objects now

The row is deleted first and the `del` is best-effort and logged: a failed `del` leaves a
recoverable orphan, while a deleted blob under a live row is a permanently broken image in her
album. The current photo cannot be removed — the query's WHERE clause refuses it, which is what
makes "zero current avatars" unreachable rather than repaired.

What is new is the **second `del()` target**. The ROW is the only record that the thumbnail object
exists — its stored pathname carries Blob's random suffix and is not derivable — so a delete that
removed one reference would leak an object nothing could ever find again. Both thumbnail fields are
NULL for every pre-F34 row and for any row whose canvas encode failed, and NULL means "there is
nothing to delete" rather than "something went wrong". It is one `del([...])` and not two calls:
`del` takes an array, both objects belong to the same photo, and a partial success has no meaning
worth reporting separately.

#### `listNinaAlbumManifestAction`

Every dedupe key already stored under a folder subtree, called BEFORE walking a dropped folder so
`planFolderUpload` has something to diff against. A Server Action and not a Route Handler even
though it is a read: it runs exactly once per drop, so serial dispatch costs nothing, and an action
keeps `requireAdmin()` as the gate with no new `/api` surface to secure.

It returns a view model (`AdminManifestEntry`), not rows. `truncated` is `>=` and not `>`, so a
subtree holding exactly the cap reports `truncated: true` when it was not — the error is in the
safe direction, and truncation is survivable at all because a short manifest makes the diff
OVER-report, the extra files are re-PUT, and their inserts are discarded by
`ON CONFLICT DO NOTHING`. Slower, never wrong — and only because the dedupe key is a constraint.

### `users.ts` — the memory page's user picker

```ts
export interface AdminUserRow { id: string; name: string | null; email: string | null; slots: number; facts: number }
export async function listAdminUsers(): Promise<AdminUserRow[]>
export async function getAdminUser(userId: string): Promise<AdminUserRow | null>
```

`listAdminUsers()` is the one unscoped read in the app, and it lives here rather than in
`lib/db/queries.ts` on purpose: `scripts/check-data-layer-invariants.mjs` fails on any export there
whose first parameter is not `userId`, and adding a fifth exception whose reason is "an admin page
needs to enumerate accounts" would blunt the guard for every future reader. So the unscoped read
sits behind `requireAdmin()`, and `lib/db/queries.ts`'s rule stays literally true. Everything the
page does after the pick is `userId`-first.

`::int` on the counts is load-bearing — Postgres `count(*)` is `bigint`, which the Neon driver hands
back as a string. Ordered by email so the picker's order is stable.

### `memoryModel.ts` / `memoryVocab.ts` / `memoryStore.ts` / `memoryActions.ts`

`memoryModel.ts` holds the bounds and shapes: `ADMIN_FACT_TEXT_MAX`, `ADMIN_RETRACTION_TEXT_MAX`,
`ADMIN_SLOT_VALUE_MAX`, `ADMIN_LEDGER_PAGE`, `ADMIN_PURGE_CONFIRMATION`, `ADMIN_FACT_CATEGORIES`,
the `SlotCard` / `FactCard` / `FactPermissions` view models, and the pure helpers `factPermissions`,
`composeRetraction`, `composeSlotRetirement`, `isPurgeConfirmed`.

`memoryVocab.ts` is the only file in the phase that imports `lib/nina/memory.ts`, and it does so as
a READER: it never coins a key, never redefines a policy, and never writes a second canonicaliser.
Exports `slotEditKind`, `slotProtection`, `describeSlot`, `slotFactCategory`,
`canonicaliseSlotValue`, `buildSlotCards`.

`memoryStore.ts` is **the only file in `/admin/memory` that names a phase-1 memory writer**, and it
exists to make one invisible failure impossible. The underlying writers default the `source` column
to the distiller's value when it is omitted, and the whole admin-preservation ruling keys off that
column — so an admin write that omits the field does not fail, it silently disables its own
protection and the next thing the runner says in chat quietly re-breaks the memory he came here to
fix. The fix is to remove the field from the vocabulary: `AdminFactDraft` and `AdminSlotDraft`
simply have no `source` or `sourceMessageId` parameter, so a caller cannot mislabel a row because
there is nowhere to put the label. It is under `lib/admin/` and not `lib/nina/` because a test
asserts that the distiller's modules do not import the two mutating ledger queries — this file
imports both, and a directory boundary keeps that test unedited.

`memoryActions.ts` exports the eight actions (`saveSlotAction`, `recordSlotAsFactAction`,
`retireSlotAction`, `removePendingPromiseAction`, `insertFactAction`, `editFactAction`,
`retractFactAction`, `purgeFactAction`) and `AdminMemoryResult`. Each follows the same four lines in
the same order: `requireAdmin()` first, Zod second, the write through `memoryStore.ts` only, then
`revalidatePath` — which re-renders the page and is **not** how the edit reaches Nina (her context
is read live on every turn with no cache).

**The one thing not to reorder**: `retractFactAction` and `retireSlotAction` each perform two
statements that are not in one transaction, and **the append comes first, always**. The appended row
contains the original text verbatim, so a crash between the two leaves a recoverable duplicate
rather than a hole.

## Internal Architecture

### Data flow — a folder upload, end to end

```
browser: drop / picker
   │
   ├─ listNinaAlbumManifestAction({ folder })      ← requireAdmin, once per drop
   │      → AdminManifestEntry[] (+ truncated)
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
   └─ in CHUNKS of NINA_ADMIN_BATCH_MAX, SERIALLY:
          registerNinaAvatarsAction({ records })   ← requireAdmin
             1. Zod: avatarBatchRegisterSchema (all-or-nothing)
             2. intra-batch dedupe on sourceKey, first writer wins
             3. one read: does a current avatar exist?
             4. declareNinaFolders(uid, [...new Set(folders)])   ← BEFORE the insert
             5. insertNinaAvatars — ON CONFLICT (user_id, source_key) DO NOTHING
             6. if there was no current row, promote one + scheduleDescribe
             7. revalidatePath('/admin/nina')
             → { inserted: [{ sourceKey, id }], skipped }
```

The vision model appears nowhere on that path. It runs only when a photo becomes her face or is
handed to her, and then through `after()`.

### Where each check lives, and why it lives there

| Concern | Client (`filetree.ts`) | Route Handler | Server Action |
|---|---|---|---|
| Path normalisation | yes — the mess is here | — | **never** (refuse instead) |
| Path validity | yes | — | yes, as identity against the normaliser |
| Filename / extension | yes | extension vs. declared content type | yes |
| Byte cap | yes (`maxBytes` arg) | enforced by the minted token | yes (`bytes` field) |
| Dedupe | yes, against the manifest | — | intra-batch, then the unique index |
| Authorization | — | `requireAdminApi` (401/404) | `requireAdmin` (redirect/404) |
| Crop range | — | — | Zod shape, then `clampCrop` |

## Dependencies

### External

- `zod` — every boundary schema in `schema.ts`.
- `@vercel/blob` — `del()` in `ninaAlbumActions.ts`, for the original and its thumbnail.
- `drizzle-orm` — `users.ts` only (`asc`, `eq`, `sql`).
- `next/cache`, `next/navigation`, `next/server` — `revalidatePath`, `redirect`/`notFound`,
  `after`.
- `server-only` — the pill on `requireAdmin.ts`, `users.ts`, `memoryStore.ts`.

### Internal

- `@/auth`, `@/lib/env` (`isAdminEmail`, `blobEnv` at the route) — the boundary's inputs.
- `@/lib/auth/requireUserId` — `UnauthorizedError`, imported rather than redefined.
- `@/lib/nina/queries` — every album and memory read/write.
- `@/lib/nina/crop` — `clampCrop`, `cropForWrite`, `resolveCrop`, and the crop bounds.
- `@/lib/nina/album` — `NINA_ADMIN_BATCH_MAX`, `NINA_ADMIN_MANIFEST_MAX`.
- `@/lib/nina/images` — `NINA_BLOB_PREFIX`, the one definition of the store layout.
- `@/lib/nina/vision` — `describeNinaImages`, reached from exactly two places here.
- `@/lib/nina/memory` — read-only, from `memoryVocab.ts` alone.
- `@/lib/db`, `@/lib/db/schema` — `users.ts` and the memory type imports.

`filetree.ts` imports **nothing**.

## Reverse Dependencies

### Primary consumers

- `components/admin/AlbumManager.tsx` — `deleteNinaAvatarAction`, `describeNinaAvatarAction`,
  `saveNinaAvatarCropAction`, `setCurrentNinaAvatarAction`.
- `components/admin/UploadAvatar.tsx` — the `avatars.ts` constants and `registerNinaAvatarAction`.
- `components/admin/explorer/**` — `filetree.ts` and the `avatars.ts` bounds (the client half).
- `app/api/admin/nina/upload/route.ts` — the whole `avatars.ts` surface plus `requireAdminApi`,
  `forbiddenJson`, `AdminIdentity`.
- `app/admin/memory/page.tsx` — `memoryModel`, `memoryStore`, `memoryVocab`, `users`, `requireAdmin`.
- `components/admin/MemoryLedger.tsx` / `MemorySlots.tsx` — `memoryActions` + `memoryModel`.

### Secondary consumers

- `app/admin/layout.tsx`, `app/admin/page.tsx`, `app/admin/nina/page.tsx` — `requireAdmin`,
  `getAdminUser`.
- `components/admin/UserPicker.tsx` — `AdminUserRow` as a type only.

### Test consumers

- `tests/admin.avatars.test.ts` — `avatars.ts`, `filetree.ts` and `schema.ts` (29 tests).
- `tests/admin.filetree.test.ts` — `filetree.ts` against the `avatars.ts` caps.
- `tests/admin.memory.test.ts` — `memoryModel.ts`, `memoryVocab.ts`.

## Concurrency

There are no goroutine-style primitives here; the relevant concurrency facts are the runtime's.

- **Server Actions are dispatched one at a time per client.** That is the entire reason the folder
  register is batched rather than called per file, and it is why the parallel work (the blob PUTs)
  goes through a Route Handler instead.
- **`after()`** defers the deferred-describe callback until the response is finished. Nothing in it
  is awaited by a caller, nothing in it revalidates, and every failure is swallowed and logged.
- **Races are settled by Postgres, not by application code.** `(user_id, source_key)` is a unique
  index and `insertNinaAvatars` is `ON CONFLICT DO NOTHING`, so two tabs submitting the same batch
  cannot double-write. `nina_avatars_user_current_unq` is a partial unique index, so the
  un-current/current ordering is owned by `setCurrentNinaAvatar` and by nothing here.
- The pure modules (`filetree.ts`, `avatars.ts`, `schema.ts`, `memoryModel.ts`, `memoryVocab.ts`)
  hold no state and are safe to call from anywhere. `NINA_FOLDER_FORBIDDEN_RE` has no `g` flag
  specifically so that sharing one regex object across callers is safe.

## Error Handling

- **Actions return, they do not throw.** Every album and memory action returns `{ ok, error? }`, so
  the client has one branch and no `unknown`. Error strings are operator-readable sentences.
- **The boundary throws framework control flow.** `requireAdmin()` calls `redirect()` or
  `notFound()`; never wrap it in a bare try/catch.
- **The API boundary throws typed errors.** `UnauthorizedError` (401) and `AdminForbiddenError`
  (404, `readonly status = 404`), so a Route Handler keeps one catch for both and answers a
  signed-in stranger exactly as the pages do.
- **Vendor and blob failures are non-fatal and logged.** A failed describe leaves a visible
  "Describe it" button; a failed `del` logs `[f34]` with the orphaned URLs and still reports
  success, because the row is already gone.
- **The orphan window is named, not fixed.** A blob PUT and never registered — tab closed, call
  failed, token outlived the page — stays in the store. A folder upload widens that window from one
  object to hundreds, and to two objects per file now that a thumbnail rides along. The reaper card
  (teaching `scripts/blob-reap.mjs` the `nina/` prefix) is open and is deliberately out of scope
  here; it is written down so the next reader finds the card instead of rediscovering the hole.

## Performance

- **The describe pre-pass is the only expensive operation, and it is off the hot path.** ~8-11 s per
  call, now reached only on promotion, on share, or on demand.
- **One read per batch, not one per file.** The "is there a current avatar" lookup and the folder
  declaration each run once for a whole chunk.
- **Single-row lookups replaced list-and-find.** The chat-side `resolveAttachment` used to read the
  entire album and `.find()` the id; it now uses the primary-key read `getNinaAvatar(userId, id)`
  (and its mirror for conversation photos). The ownership property is unchanged — `user_id` is in
  the WHERE, so "not his" and "does not exist" are still the same `null` — only the read shrank.
- **The thumbnail is the grid's whole performance story.** A derived 256 px blob beside each
  original, because `next/image` on Blob-hosted photos costs a paid transform quota and downscaling
  the original would ruin the crop zoom.
- `planFolderUpload` is O(files) with two `Set`s; `folderCounts` and `buildTree` are single passes.
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

- **Do not add an import to `filetree.ts`.** Not even for the byte cap — that is what the `maxBytes`
  parameter is for. One server-side import and the client explorer stops compiling.
- **Do not make `folderPathSchema` normalise.** It validates a canonical path; normalisation is the
  browser's job, and a server-side rewrite is the invisible-corruption failure the identity check
  exists to prevent.
- **Do not re-spell a bound in `schema.ts`.** Every one is imported. A duplicated number is a number
  that will one day disagree.
- **Do not put a describe call on a register path.** It was there, it was measured, and it was
  moved for stated reasons.
- **Do not delete a photo's row without both blob references.** The row is the only record the
  thumbnail exists; its stored pathname is not derivable.
- **`declareNinaFolders` goes before the insert**, and once per batch. Reversing the order leaves
  photographs in a folder nothing declared.
- **`registerNinaAvatarAction` (singular) writes no `source_key`**, so its rows are invisible to the
  manifest diff. That is documented behaviour, not a bug — it is the F33 path, kept until the screen
  that calls it is replaced.

## Notes

`registerNinaAvatarAction` and `registerNinaAvatarsAction` coexist deliberately for one more phase:
`components/admin/UploadAvatar.tsx` is still the singular action's caller, and that component
belongs to the phase that replaces the whole screen. A dangling export, or two upload paths that
can disagree, would both be worse than one action with one caller for one more phase.

Known, filed limitations: lexicographic rather than natural folder sort; `truncated` over-reports at
exactly the manifest cap; empty directories in a dropped tree are invisible to the browser and so
never survive an upload (only *"New subfolder"* can create one).

## Documentation Created

2026-09-04 — initial creation via `/update-readme`, following task **P1-RI-A002**
(`admin-album-file-manager` phase 4, the folder-aware upload boundary). That task added the
folder-path / filename / dedupe-key / batch-register schemas to `schema.ts`;
`registerNinaAvatarsAction`, `listNinaAlbumManifestAction` and `ensureNinaAvatarDescriptionAction`
to `ninaAlbumActions.ts`, along with the second `del()` on delete and the move of the describe
pre-pass onto `after()`; the thumbnail pathname shape and its 512 KB token cap to the upload Route
Handler; the single-row reads in the chat-side `resolveAttachment`; and 21 tests to
`tests/admin.avatars.test.ts` (29 in that suite).
