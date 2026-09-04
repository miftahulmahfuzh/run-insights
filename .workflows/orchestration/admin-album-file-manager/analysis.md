# Code Analysis: `/admin/nina` — the album as a file manager, and "share link to Nina"

**Type:** Feature Implementation
**Date:** 2026-09-04 13:12 (Asia/Jakarta)
**Session ID:** 20260904-131215-A3F7
**Plan:** `ADMIN_ALBUM_FILE_MANAGER_PLAN.md` (7 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/admin-album-file-manager`, branch `feature/admin-album-file-manager` (base `origin/main` @ `21a69ef`)

---

## User Input

### Original User Request

> admin page (desktop usage)
> additional requirement: can we make it so that the in /admin/nina profile album, it looks like a file manager instead? this way i can upload nested folders, and make the photos much more structured and easier to maintain. i will put hundreds of profile pics in there, and i very much prefer we can upload folders instead (maybe also drag and drop folders from my local win explorer into the page. it would be perfect if i can drag and drop existing folders, and it automatically upload only the new folders and files as optimization). during uploading, it automatically only upload image files, and in the file explorer view, we can click a photo and select it as profile picture. and i also need the feature to click a photo and an option "share link to nina" can be clicked-> clicking it automatically open runins.site chat in a new browser tab and put this file as an attachment (to optimize it, we dont actually reupload the photo into the chat, but just some kind of pointer to the existing file) . user can input additional text question / comment (optional), and nina will respond to it accordingly

### User-Provided Context

- **Desktop usage** is stated up front, which matches what `app/admin/layout.tsx` already is (the
  app's only deliberately-desktop layout, `max-w-[1400px]`, no `AppShell`, no `TabBar`).
- **Scale is stated as a requirement, not an aside:** *"i will put hundreds of profile pics in
  there."* Every measurement below about the current screen is taken against that number.
- **The optimisation is named twice**, once per requirement: upload only what is new, and attach a
  pointer rather than re-uploading bytes.

### User-Provided Files

None marked with `@`. Every file below was discovered by exploration.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Turn `/admin/nina`'s album into a **file manager**: nested folders; upload whole folders (picker *and* drag-and-drop from Windows Explorer); upload only the new folders and files; only image files; an explorer view where clicking a photo lets you select it as the profile picture. |
| R2 | In that explorer, clicking a photo offers **"share link to Nina"** — which opens the runins.site chat in a new browser tab with that photo attached *by pointer, not re-upload*, where an optional question or comment can be typed and Nina answers it. |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**

`/admin/nina` today is a flat grid of circular thumbnails backed by one unpaginated query and one
single-file upload button. It was built for the handful of faces F33 R23 described. The user is
about to put hundreds of files into it, organised the way they are organised on his laptop — in
nested folders — and needs the screen to be the file manager that shape implies: a folder tree, a
folder-scoped content pane, folder-aware upload from a directory picker or a dropped Explorer
folder, and an incremental upload that skips what is already there.

Separately, he wants the album to be a source for the chat: pick a photo, hand it to Nina in a new
tab, ask something about it. The server plumbing for that already exists and is unused from
`/admin` — see **The `attachExisting` finding** below.

**Success Criteria**

R1:
1. `/admin/nina` renders a folder tree and a folder-scoped content pane, with a breadcrumb.
2. A directory picker (`webkitdirectory`) uploads a nested folder and preserves its structure.
3. A folder dragged from Windows Explorer onto the page uploads with its structure preserved.
4. Non-image entries in a dropped or picked folder are silently skipped, not errors.
5. Re-dropping a folder that is already uploaded uploads nothing; re-dropping it with three new
   files in a new subfolder uploads exactly those three files and creates that subfolder.
6. Clicking a photo in the content pane selects it, and one click sets it as her profile picture —
   the existing framing studio still applies to the selection.
7. Hundreds of rows render without downloading hundreds of full-size originals.

R2:
8. A selected photo offers "Share link to Nina".
9. Clicking it opens `runins.site/nina` in a **new browser tab** with that photo already attached
   in the composer.
10. No image bytes are re-uploaded on that path — the new message points at the existing blob.
11. An optional question typed in the chat is sent with it, and an empty one is still a valid send.
12. Nina answers the message; a description of the photo reaches her as text.

**Key Considerations**

- **The describe pre-pass is on the upload path today, synchronously.**
  `registerNinaAvatarAction` awaits `describeNinaImages`, a `glm-4.6v` call measured at ~8–11 s
  typical with a 25 s timeout (`lib/nina/vision.ts:NINA_DESCRIBE_TIMEOUT_MS`). At one upload a
  month that is a feature. At three hundred it is three hundred vendor round trips, three hundred
  invocations' worth of wall clock, and a bill — for descriptions of photos Nina may never be shown.
  The description is only ever read by her prompt, so it is needed when a photo becomes *current*
  or is *shared to chat*, not when it lands in a folder.
- **`nina_avatars` has no notion of a folder.** There is `pathname`, but Blob's
  `addRandomSuffix: true` rewrites it, so the stored pathname is Blob's, not ours; folder identity
  cannot be parsed back out of it and has to be its own column.
- **`insertNinaAvatarAsCurrent` is the only insert the data layer exposes, and it always
  un-currents and re-currents.** A batch upload cannot use it — three hundred calls would rewrite
  the current row three hundred times, and `nina_avatars_user_current_unq` makes the order
  load-bearing.
- **`next/image` is off the table for these blobs, by a documented decision.**
  `components/nina/NinaPhotoGrid.tsx:56-58` rejects it explicitly (*"`next/image` would re-optimise
  finished files on a paid transform quota"*), and `components/admin/UploadAvatar.tsx:26-33` rejects
  compression of the original for a different and equally sound reason (a 4× crop zoom on a 768 px
  source shows her face at 192 px). Both hold. A grid of hundreds therefore needs a derived
  thumbnail blob written at upload time — the original still goes up whole.
- **The refusal rule in `sendNinaMessage` is documented as complete and monotone.** R2 adds no
  clause to it; `attachExisting != null` is already the fourth disjunct.
- **`/admin` is a real security boundary.** `proxy.ts` matches neither `/admin` nor `/api/*`
  (`lib/admin/requireAdmin.ts:13-16`), so `requireAdmin()` in the layout, in every page and in
  every action, plus `requireAdminApi()` in the Route Handler, are the only gates. Every new action
  and every widened pathname regex is on that boundary.

**Assumptions**

- Folder structure is metadata, not blob layout. Blob pathnames keep the flat
  `nina/<userId>/avatar-<id>.<ext>` shape; the folder lives in a column. Moving a photo between
  folders is then an UPDATE, not a copy-and-delete of bytes. *(Stated as a decision, not a
  question — the alternative makes rename an O(files) blob rewrite.)*
- "Only upload new files" is decided by `(relative path, size, lastModified)`, not by content hash.
  A browser can read those three from a `File` for free; hashing hundreds of megabytes to answer
  "have I seen this?" costs more than the upload it saves.
- `runins.site` is this app's own origin in production, so "open runins.site chat" is
  `window.open('<origin>/nina?…', '_blank')` where the origin comes from `shareOrigin()`
  (`lib/share/origin.ts`) — the function whose whole job is "never `VERCEL_URL`".

---

## Analysis Scope

### Explicitly Mentioned Files

None. The target was named by URL (`/admin/nina`) and by behaviour.

### Discovered Related Files

**The admin album, as it stands**
- `app/admin/nina/page.tsx` — Server Component; gate, one query, row→prop map, one client component
- `app/admin/layout.tsx` — the desktop shell (`max-w-[1400px]`, `224px` nav + `minmax(0,1fr)`)
- `components/admin/AlbumManager.tsx` — the whole screen body: framing studio + flat album grid
- `components/admin/UploadAvatar.tsx` — single-file picker → direct Blob PUT → register action
- `components/admin/CropStudio.tsx`, `components/admin/CircleFrame.tsx` — framing, reused as-is
- `components/admin/AdminNav.tsx` — `/admin` nav
- `lib/admin/ninaAlbumActions.ts` — five Server Actions (register, set-current, crop, delete, describe)
- `lib/admin/avatars.ts` — pathname builder, content types, size caps, request-pathname predicate
- `lib/admin/schema.ts` — Zod for everything the browser sends
- `lib/admin/requireAdmin.ts` — the gate (`requireAdmin`, `requireAdminApi`, `getAdminIdentity`)
- `app/api/admin/nina/upload/route.ts` — the Blob client-upload token handshake

**The data layer**
- `lib/db/schema.ts:1087-1122` — `ninaAvatars` table, its partial unique index and its `(user, created desc)` index
- `lib/db/schema.ts:1039` — `NinaAvatarSource = 'seed' | 'generated' | 'operator' | 'admin'`
- `lib/nina/queries.ts:903-1127` — the nine avatar queries
- `drizzle/0002_nina.sql`, `drizzle/meta/_journal.json` — migration history (next is `0003`)

**The chat side (R2's existing plumbing)**
- `lib/nina/actions.ts:114-174` — `NinaAttachExisting` and `resolveAttachment`
- `lib/nina/actions.ts:237-283` — the `attachExisting` input field and the complete refusal rule
- `lib/nina/albumActions.ts` — `attachNinaPhotoToChat`, the one existing caller
- `components/nina/NinaAboutScreen.tsx:176-199, 255-277` — the mobile UI that calls it
- `components/nina/ChatScreen.tsx:96-135, 321-445` — `?attach=` consumption, `handleSend`
- `components/nina/Composer.tsx:129-321` — the composer, its tiles, and the run-attachment chip
- `components/nina/AttachmentChip.tsx` — the pinned-run chip above the textarea
- `lib/nina/attach.ts` — `ATTACH_PARAM`, the `/nina?attach=<runId>` idiom
- `app/nina/page.tsx:88-140` — `searchParams`, three concurrent reads, `maxDuration = 60`
- `lib/share/origin.ts` — `shareOrigin()`

**Supporting**
- `lib/nina/vision.ts` — `describeNinaImages`, the 25 s timeout, the token floor
- `lib/nina/album.ts` — `NINA_ALBUM_MAX = 60`, `NINA_ATTACH_MAX_CHARS = 600`, `ninaAvatarView`
- `lib/nina/crop.ts` — `clampCrop`, `resolveCrop`, `cropForWrite`, the bound constants
- `lib/nina/images.ts` — `NINA_BLOB_PREFIX`, `planNinaPicked` (the purity precedent)
- `lib/photos/compressForNina.ts`, `lib/photos/resizeTarget.ts` — client-side downscale precedent
- `components/nina/NinaPhotoGrid.tsx:56-58` — the "no `next/image` for Blob photos" ruling
- `next.config.ts` — `remotePatterns` for Blob, the cache headers
- `tests/admin.avatars.test.ts`, `tests/admin.memory.test.ts`, `tests/env.admin.test.ts`
- `.github/workflows/ci.yml`, and the `ci:*-guard` scripts in `package.json`

---

## Current Dataflow

### Entry Point: `GET /admin/nina`

**Location:** `app/admin/nina/page.tsx:22`
**Trigger:** navigation; `export const dynamic = 'force-dynamic'`
**Input:** none — no `searchParams`, no `params`
**Validation:** `requireAdmin()` at line 23 (and again in `app/admin/layout.tsx:45`)
**Transform:** `listNinaAvatars(userId)` → `AlbumPhoto[]`, dropping `announcedAt` and `pathname` so
`NinaAvatarRow` never crosses the serialization boundary wholesale (lines 26-40)
**Next Step:** `<AlbumManager photos userId />`

### Processing Chain — the upload path as it exists

1. **`UploadAvatar.onPick`** — `components/admin/UploadAvatar.tsx:51`
   - Input: one `File` from `<input type="file">` (single, no `multiple`, no `webkitdirectory`)
   - Checks: content type ∈ 3, `size ≤ 8 MB`, `createImageBitmap` decode for `width`/`height`
   - Output: `adminAvatarPathname(userId, newId(), ext)` = `nina/<userId>/avatar-<nanoid12>.<ext>`
   - Calls: `upload(...)` from `@vercel/blob/client` with `handleUploadUrl: '/api/admin/nina/upload'`

2. **`POST /api/admin/nina/upload`** — `app/api/admin/nina/upload/route.ts:60`
   - `blobEnv()`, then `requireAdminApi()` **before** `handleUpload` (so a refusal is a 404/401,
     not `handleUpload`'s blanket 400)
   - `onBeforeGenerateToken`: `isAdminAvatarRequestPathname(pathname, identity.userId)` — the
     userId is interpolated **from the session**, never read from the request
   - Returns a token with `addRandomSuffix: true`, `allowOverwrite: false`,
     `maximumSizeInBytes: 8 MB`, `validUntil: +10 min`, `tokenPayload: { userId }`
   - **Never receives image bytes.** `onUploadCompleted` logs and writes nothing.

3. **Browser PUTs to Blob directly.** The stored pathname carries Blob's random suffix and differs
   from the requested one.

4. **`registerNinaAvatarAction(input)`** — `lib/admin/ninaAlbumActions.ts:87`
   - `requireAdmin()`, `avatarRegisterSchema.safeParse`
   - `makeCurrent: false` → read the current row's id, `insertNinaAvatarAsCurrent(...)`, then
     `setCurrentNinaAvatar(previousCurrentId)` — two statements to hand the crown back, because
     phase 1 exposes only the always-current insert
   - `revalidatePath('/admin/nina')`
   - **Then `await describeNinaImages([...])`** and `setNinaAvatarDescription`, non-fatal, followed
     by a second `revalidatePath`

### Processing Chain — the existing "attach a photo we already own" path

1. **`attachNinaPhotoToChat({ kind, id, body })`** — `lib/nina/albumActions.ts:43`
   - clamps `body` to `NINA_ATTACH_MAX_CHARS` (600), calls `sendNinaMessage`

2. **`sendNinaMessage({ body, attachExisting })`** — `lib/nina/actions.ts:238`
   - `requireUserId()`; `attachExisting` shape-checked with `isValidId` (line 244-248)
   - refusal rule (line 277): `text.length === 0 && tickets === 0 && runId === null && attach === null`
     — so a photo with no words **is** a valid send
   - `resolveAttachment` (line 141) resolves ownership *before* any row is written:
     `'avatar'` → `listNinaAvatars(userId).find(id)`, `'image'` → `listNinaMessageImages(...)`
   - **No vision call on this path** (line 135-140): `nina_avatars.description` is already what
     `glm-4.6v` would have produced, so it is copied onto the new `nina_message_images` row and
     reaches her as text
   - a miss is a **refusal**, not a silent text-only send

3. **`NinaAboutScreen.attach`** — `components/nina/NinaAboutScreen.tsx:176`
   - the only caller today: `router.refresh()` then `router.push('/nina')`, same tab, mobile

### Data Persistence

**`nina_avatars`** (`lib/db/schema.ts:1087`)

| Column | Type | Note |
|---|---|---|
| `id` | `text` PK | `newId()` = nanoid(12) over `A-Za-z0-9_-` |
| `user_id` | `text` NOT NULL | FK → `users.id`, `on delete cascade` |
| `blob_url` | `text` NOT NULL | |
| `pathname` | `text` NOT NULL | Blob's *stored* pathname, suffix included |
| `width`, `height`, `bytes` | `integer` NULL | browser-measured, Zod-bounded |
| `source` | `text` NOT NULL | `'seed' \| 'generated' \| 'operator' \| 'admin'` |
| `crop_scale` | `numeric(5,3)` NULL | NULL = identity |
| `crop_x`, `crop_y` | `integer` NULL | per-mille of frame width |
| `description` | `text` NULL | `glm-4.6v`'s prose; read only by her prompt |
| `is_current` | `boolean` NOT NULL default false | |
| `announced_at` | `timestamptz` NULL | NULL = she has not mentioned this one |
| `created_at` | `timestamptz` NOT NULL default now() | |

Indexes: `nina_avatars_user_current_unq on (user_id) where is_current` (partial unique — two
current avatars are *impossible*), `nina_avatars_user_created_idx on (user_id, created_at desc)`.

**Blob:** `nina/<userId>/avatar-<nanoid12>.<jpg|png|webp>` + Blob's random suffix.
`scripts/blob-reap.mjs` does **not** know the `nina/` prefix — recorded as ruling D4's open card.

### Exit Points

- `AdminActionResult { ok, error?, id?, description? }` — one shape for every album action
- `revalidatePath('/admin/nina')` in every mutating action; the page is `force-dynamic`
- Blob `del()` on delete, best-effort, row-first (an orphan is recoverable; a broken image is not)

### State Changes

- `nina_avatars` INSERT / UPDATE / DELETE
- Vercel Blob PUT (browser→Blob) and DELETE (action→Blob)
- One `glm-4.6v` call per registered upload, today

---

## Key Data Structures

### `NinaAvatarRow` — `lib/nina/queries.ts:226`
The nine avatar queries' shared row shape: `id`, `blobUrl`, `pathname`, `width`, `height`, `bytes`,
`source`, `cropScale`, `cropX`, `cropY`, `description`, `isCurrent`, `announcedAt`, `createdAt`.
Assignable to `AvatarLike` in `lib/nina/album.ts:89` — which is the codebase's stated boundary
idiom: *"the pure module states what it needs, and the query happens to return something assignable
to it."*

### `AlbumPhoto` — `components/admin/AlbumManager.tsx:34`
The client's view model. Deliberately narrower than the row.

### `AvatarRegister` — `lib/admin/schema.ts:52`
`{ blobUrl, pathname, contentType, width, height, bytes, makeCurrent }`. Every field checked,
including the two the browser measured itself.

### `NinaAttachExisting` — `lib/nina/actions.ts:127`
`{ kind: 'avatar' | 'image', id: string }`. *"Deliberately an id and a kind rather than a URL: a URL
from a client is a claim, and an id resolved against `user_id` is a fact."*

### `NinaCrop` / `NinaCropInput` — `lib/nina/crop.ts`
`{ scale, x, y }` with `resolveCrop`/`clampCrop`/`cropForWrite`. Untouched by this work.

### `Tile` — `components/nina/Composer.tsx:106`
`{ id, previewUrl, state, error, ticket, blobUrl }` — the chat composer's per-photo upload state
machine (`compressing → uploading → describing → ready | error`). The **precedent** for the upload
queue R1 needs, at a different scale.

---

## Dependencies

### Configuration / Environment
- `ADMIN_EMAILS` → `isAdminEmail` (`lib/env.ts`); an email not on the list 404s every `/admin/*`
- `blobEnv()` — `BLOB_READ_WRITE_TOKEN`
- `AUTH_SECRET` — signs image tickets (not used on the `attachExisting` path)
- `AUTH_URL` → `shareOrigin()`; production is `https://runins.site`
- `LLM_API_KEY`, `LLM_VISION_BASE_URL`, `LLM_VISION_MODEL` — `glm-4.6v`

### External Services
- Vercel Blob (client-upload handshake; direct browser PUT)
- z.ai `glm-4.6v` (describe), `glm-5.3` (the turn)
- Neon Postgres via Drizzle; `db.batch` for the un-current/insert pair

### Browser APIs the new work depends on
- `HTMLInputElement.webkitDirectory` — the directory picker; `File.webkitRelativePath` carries the
  in-folder path
- `DataTransferItem.webkitGetAsEntry()` → `FileSystemDirectoryEntry.createReader().readEntries()` —
  the *only* way to read a dropped folder's structure. Chromium and WebKit ship it; it is
  non-standard, and `readEntries` returns results **in batches and must be called until it returns
  empty**, which is the classic silent-truncation bug in every naive implementation.
- `createImageBitmap` + `OffscreenCanvas` — thumbnail derivation, already the decode path
  `UploadAvatar` and `compressForNina` use

---

## Reference List

Every site that touches the album's shape, its upload path, or the attach-existing path.

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `ninaAvatars` | `lib/db/schema.ts:1087` | def | `lib/db` |
| `nina_avatars_user_current_unq` | `lib/db/schema.ts:1117` | def | `lib/db` |
| `nina_avatars_user_created_idx` | `lib/db/schema.ts:1121` | def | `lib/db` |
| `NinaAvatarSource` | `lib/db/schema.ts:1039` | def | `lib/db` |
| `NinaAvatar` / `NewNinaAvatar` | `lib/db/schema.ts:1276` | def | `lib/db` |
| `NinaAvatarRow` | `lib/nina/queries.ts:226` | def | `lib/nina` |
| `avatarColumns` | `lib/nina/queries.ts` (near 900) | def | `lib/nina` |
| `getCurrentNinaAvatar` | `lib/nina/queries.ts:903` | def | `lib/nina` |
| `listNinaAvatars` | `lib/nina/queries.ts:913` | def | `lib/nina` |
| `insertNinaAvatarAsCurrent` | `lib/nina/queries.ts:955` | def | `lib/nina` |
| `updateNinaAvatarCrop` | `lib/nina/queries.ts:1017` | def | `lib/nina` |
| `setNinaAvatarDescription` | `lib/nina/queries.ts:1038` | def | `lib/nina` |
| `getNinaAvatar` | `lib/nina/queries.ts:1057` | def | `lib/nina` |
| `setCurrentNinaAvatar` | `lib/nina/queries.ts:1085` | def | `lib/nina` |
| `deleteNinaAvatar` | `lib/nina/queries.ts:1116` | def | `lib/nina` |
| `listNinaAvatars` (call) | `app/admin/nina/page.tsx:24` | call | `app/admin` |
| `listNinaAvatars` (call) | `lib/nina/actions.ts:151` | call | `lib/nina` |
| `listNinaAvatars` (call) | `app/nina/about/page.tsx` | call | `app/nina` |
| `getCurrentNinaAvatar` (call) | `app/nina/page.tsx:113` | call | `app/nina` |
| `getCurrentNinaAvatar` (call) | `lib/admin/ninaAlbumActions.ts:98` | call | `lib/admin` |
| `ADMIN_AVATAR_EXTS` | `lib/admin/avatars.ts:31` | def | `lib/admin` |
| `ADMIN_AVATAR_CONTENT_TYPES` | `lib/admin/avatars.ts:35` | def | `lib/admin` |
| `ADMIN_AVATAR_MAX_UPLOAD_BYTES` | `lib/admin/avatars.ts:43` | def | `lib/admin` |
| `ADMIN_AVATAR_MIN_EDGE_PX` | `lib/admin/avatars.ts:46` | def | `lib/admin` |
| `ADMIN_AVATAR_MAX_EDGE_PX` | `lib/admin/avatars.ts:49` | def | `lib/admin` |
| `ADMIN_AVATAR_ID_RE` | `lib/admin/avatars.ts:52` | def | `lib/admin` |
| `adminAvatarPathname` | `lib/admin/avatars.ts:61` | def | `lib/admin` |
| `extForContentType` | `lib/admin/avatars.ts:66` | def | `lib/admin` |
| `isAdminAvatarRequestPathname` | `lib/admin/avatars.ts:84` | def | `lib/admin` |
| `isAdminAvatarRequestPathname` (call) | `app/api/admin/nina/upload/route.ts:88` | call | `app/api` |
| `avatarIdSchema` | `lib/admin/schema.ts:35` | def | `lib/admin` |
| `cropWriteSchema` | `lib/admin/schema.ts:37` | def | `lib/admin` |
| `avatarRegisterSchema` | `lib/admin/schema.ts:52` | def | `lib/admin` |
| `registerNinaAvatarAction` | `lib/admin/ninaAlbumActions.ts:87` | def | `lib/admin` |
| `setCurrentNinaAvatarAction` | `lib/admin/ninaAlbumActions.ts:135` | def | `lib/admin` |
| `saveNinaAvatarCropAction` | `lib/admin/ninaAlbumActions.ts:155` | def | `lib/admin` |
| `deleteNinaAvatarAction` | `lib/admin/ninaAlbumActions.ts:185` | def | `lib/admin` |
| `describeNinaAvatarAction` | `lib/admin/ninaAlbumActions.ts:57` | def | `lib/admin` |
| `AdminActionResult` | `lib/admin/ninaAlbumActions.ts:41` | def | `lib/admin` |
| `AlbumManager` / `AlbumPhoto` | `components/admin/AlbumManager.tsx:34,47` | def | `components/admin` |
| `UploadAvatar` | `components/admin/UploadAvatar.tsx:44` | def | `components/admin` |
| `CropStudio` | `components/admin/CropStudio.tsx` | def | `components/admin` |
| `CircleFrame` | `components/admin/CircleFrame.tsx` | def | `components/admin` |
| `AdminNav` | `components/admin/AdminNav.tsx` | def | `components/admin` |
| `requireAdmin` | `lib/admin/requireAdmin.ts:69` | def | `lib/admin` |
| `requireAdminApi` / `forbiddenJson` | `lib/admin/requireAdmin.ts` | def | `lib/admin` |
| `NinaAttachExisting` | `lib/nina/actions.ts:127` | def | `lib/nina` |
| `resolveAttachment` | `lib/nina/actions.ts:141` | def | `lib/nina` |
| `sendNinaMessage` (`attachExisting`) | `lib/nina/actions.ts:237` | def | `lib/nina` |
| `attachNinaPhotoToChat` | `lib/nina/albumActions.ts:43` | def | `lib/nina` |
| `attachNinaPhotoToChat` (call) | `components/nina/NinaAboutScreen.tsx:185` | call | `components/nina` |
| `NINA_ATTACH_MAX_CHARS` | `lib/nina/album.ts:62` | def | `lib/nina` |
| `NINA_ALBUM_MAX` | `lib/nina/album.ts:47` | def | `lib/nina` |
| `ATTACH_PARAM` | `lib/nina/attach.ts:46` | def | `lib/nina` |
| `ATTACH_PARAM` (call) | `app/nina/page.tsx:88`, `components/nina/ChatScreen.tsx:128`, `app/r/[id]/page.tsx:187` | call | `app`, `components` |
| `Composer` (`attachment` prop) | `components/nina/Composer.tsx:129` | def | `components/nina` |
| `handleSend` | `components/nina/ChatScreen.tsx:321` | def | `components/nina` |
| `AttachmentChip` | `components/nina/AttachmentChip.tsx` | def | `components/nina` |
| `describeNinaImages` | `lib/nina/vision.ts:296` | def | `lib/nina` |
| `NINA_DESCRIBE_TIMEOUT_MS` | `lib/nina/vision.ts` (~60) | def | `lib/nina` |
| `shareOrigin` | `lib/share/origin.ts:25` | def | `lib/share` |
| `planNinaPicked` | `lib/nina/images.ts` | def | `lib/nina` (purity precedent) |
| `compressForNina` | `lib/photos/compressForNina.ts` | def | `lib/photos` (downscale precedent) |
| `remotePatterns` | `next.config.ts:10` | config | root |
| `drizzle/meta/_journal.json` | — | config | `drizzle` (next migration is `0003`) |
| `tests/admin.avatars.test.ts` | — | test | `tests` |

---

## Impact Points (files that WILL need changes)

| # | File | Why | Phase |
|---|---|---|---|
| 1 | `lib/db/schema.ts` | folder / filename / dedupe-key / thumbnail columns on `ninaAvatars`, plus a `(user_id, folder)` index | 1 |
| 2 | `drizzle/0003_*.sql` + `drizzle/meta/*` | the migration for #1 | 1 |
| 3 | `lib/nina/queries.ts` | folder-scoped list, folder manifest, distinct-folder listing, a **plain** batch insert that does not touch `is_current`, folder move/rename/delete | 1 |
| 4 | `lib/admin/avatars.ts` | folder path grammar and its bounds; `isAdminAvatarRequestPathname` stays the guard for the *blob* pathname | 1 |
| 5 | `lib/admin/filetree.ts` **(new)** | pure: image filter, path normalisation, tree build, the upload diff | 2 |
| 6 | `tests/admin.filetree.test.ts` **(new)** | the diff and the normalisation are where the bugs live | 2 |
| 7 | `lib/nina/attach.ts` | the `?photo=` idiom beside `ATTACH_PARAM`, and its parse/format pair | 3 |
| 8 | `app/nina/page.tsx` | read `?photo=`, resolve the pointer, hand it to `ChatScreen` | 3 |
| 9 | `components/nina/ChatScreen.tsx` | carry the existing-photo pointer as composer state; pass `attachExisting` to `sendNinaMessage` | 3 |
| 10 | `components/nina/Composer.tsx` | a chip for an already-owned photo; one more disjunct in `canSend` | 3 |
| 11 | `lib/nina/queries.ts` (read-only add) | resolve one avatar/image id to a thumbnail for the chip | 3 |
| 12 | `app/api/admin/nina/upload/route.ts` | accept the thumbnail pathname shape; unchanged auth | 4 |
| 13 | `lib/admin/schema.ts` | batch-register schema, folder-path schema, folder-op schemas | 4 |
| 14 | `lib/admin/ninaAlbumActions.ts` | batch register; **take `describeNinaImages` off the upload path**; manifest read | 4 |
| 15 | `components/admin/AlbumManager.tsx` | superseded by the explorer; framing pane extracted | 5 |
| 16 | `components/admin/UploadAvatar.tsx` | superseded by the folder uploader | 5 |
| 17 | `components/admin/FileExplorer.tsx` **(new)** + tree/tile/dropzone/queue children | the explorer view | 5 |
| 18 | `app/admin/nina/page.tsx` | folder-scoped reads, `?folder=` segment state, new props | 5 |
| 19 | `lib/admin/ninaAlbumActions.ts` | folder create / rename / move / delete actions | 6 |
| 20 | `components/admin/FileExplorer.tsx` | the folder-maintenance affordances | 6 |
| 21 | `components/admin/FileExplorer.tsx` | the "Share link to Nina" item | 7 |
| 22 | `app/admin/nina/page.tsx` | pass `shareOrigin()` down as a prop (it is `server-only`) | 7 |
| 23 | `lib/nina/album.ts` | `NINA_ALBUM_MAX = 60` is a render cap on an unpaginated read; both change | 1, 5 |

**This document describes. The plan files prescribe.**
