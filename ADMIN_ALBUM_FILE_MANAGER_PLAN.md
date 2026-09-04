# Plan: `/admin/nina` — the album as a file manager, and "share link to Nina"

**Slug:** `admin-album-file-manager`
**Date:** 2026-09-04 13:12 (Asia/Jakarta)
**Analysis:** `20260904-131215-A3F7_code_analyzer.md`
**Worktree:** `/home/miftah/.worktrees/run-insights/admin-album-file-manager`
**Branch:** `feature/admin-album-file-manager` (base: `origin/main` @ `21a69ef`)
**Phases:** 7
**Status:** in flight — 6/7 phases complete (1, 2, 3, 4, 5, 7); phase 6 is the one outstanding, and the set is merged as a whole once it lands; a phase is complete when its row in the Phases table is ticked ✅
**Reconciled:** 2026-09-04, round 1 (see the Reconciliation Log)
**Coordinator:** —

---

## Why

The user's words, verbatim, because they are the specification:

> admin page (desktop usage)
> additional requirement: can we make it so that the in /admin/nina profile album, it looks like a file manager instead? this way i can upload nested folders, and make the photos much more structured and easier to maintain. i will put hundreds of profile pics in there, and i very much prefer we can upload folders instead (maybe also drag and drop folders from my local win explorer into the page. it would be perfect if i can drag and drop existing folders, and it automatically upload only the new folders and files as optimization). during uploading, it automatically only upload image files, and in the file explorer view, we can click a photo and select it as profile picture. and i also need the feature to click a photo and an option "share link to nina" can be clicked-> clicking it automatically open runins.site chat in a new browser tab and put this file as an attachment (to optimize it, we dont actually reupload the photo into the chat, but just some kind of pointer to the existing file) . user can input additional text question / comment (optional), and nina will respond to it accordingly

Three phrases in there are load-bearing and are quoted again in the phases that own them:
*"hundreds of profile pics"* (which is why nothing in this plan reads the album unpaginated, and
why the grid never downloads an original), *"only upload the new folders and files"* (the diff in
phase 2), and *"not actually reupload the photo into the chat, but just some kind of pointer"*
(which is `attachExisting`, and it already exists).

## Requirements

| ID | What the user asked for | Phases |
|---|---|---|
| R1 | `/admin/nina` becomes a file manager: nested folders, folder upload by picker and by drag-and-drop from Windows Explorer, uploading only what is new, image files only, and an explorer view where clicking a photo lets you set it as her profile picture | 1, 2, 4, 5, 6 |
| R2 | "Share link to Nina" on a photo in that explorer: opens the runins.site chat in a new browser tab with the photo attached as a pointer rather than a re-upload, takes an optional question, and Nina answers it | 3, 4, 7 |

`R2` gains **phase 4** in reconciliation. `resolveAttachment` (`lib/nina/actions.ts:141`) — the
function that turns R2's pointer back into a row — resolved ownership with an unbounded
`listNinaAvatars(userId).find(...)`. Phases 3 and 7 both found it and neither was allowed to open
that file; phase 7 escalated it as the one failure a green CI cannot see. Phase 4 now owns the
two-line fix (Step 6), so a share link is a primary-key lookup regardless of how large the album
gets. That is R2 work in an R1 phase, and the table says so rather than the phase's `Satisfies`
line being widened silently.

## Scope

**In scope**

- `nina_avatars` gains folder metadata, a client-supplied dedupe key, and a thumbnail blob.
- **A `nina_folders` table, so a folder can exist while empty** — added on the owner's instruction
  after reconciliation, which had judged R1 satisfiable without it. Phase 1 owns the table, the
  migration and three statements; phase 6 calls all three; phase 4 declares the folder an upload
  lands in. `listNinaAvatarFolders` UNIONs the declarations with the folders the photograph rows
  imply, so neither source is authoritative and disagreement degrades instead of corrupting.
- A pure library for the client-side folder walk, the image filter, the path grammar and the
  "what is new" diff, with unit tests (invariant 6: vitest runs `environment: 'node'`).
- Folder-aware upload: `webkitdirectory` picker **and** a `DataTransferItem` entry walk for a
  folder dragged from Explorer, both feeding one bounded-concurrency queue.
- A batch register action, and **removal of the synchronous `glm-4.6v` describe from the upload
  path** — it becomes on-demand, and automatic at the two moments the description is actually
  needed (set-as-current, share-to-Nina).
- The explorer UI: folder tree, breadcrumb, folder-scoped paginated content pane (a **numbered
  `?page=` pager over an `OFFSET`, with a total** — reconciled from this document's draft wording of
  "a page cursor"; see the Reconciliation Log, row 6), thumbnail grid, selection, and the framing
  studio kept for the selection.
- Folder maintenance: create, rename, move, delete (with the current photo protected).
- The `?photo=` chat idiom end to end, and the admin menu item that opens it in a new tab.

**Out of scope, and why**

- **No change to `crop_scale`/`crop_x`/`crop_y`, `clampCrop`, `CropStudio` or `CircleFrame`.**
  Framing landed in F33 and is correct; the explorer re-hosts it, it does not re-litigate it.
- **No change to `/nina/about`'s mobile album.** It keeps calling `attachNinaPhotoToChat` and
  keeps its same-tab `router.push('/nina')`. R2 is a *second* entry point, not a replacement.
- **No re-encode of the original upload.** `components/admin/UploadAvatar.tsx:26-33` explains why
  (a 4× crop zoom on a downscaled source shows her face at 192 px), and phase 13's full-screen
  viewer serves the same blob. A *derived thumbnail* is added beside it; the original is untouched.
- **No `next/image` on Blob-hosted photos.** `components/nina/NinaPhotoGrid.tsx:56-58` rules it
  out on a paid transform quota. The thumbnail blob is the answer instead.
- **No new clause in `sendNinaMessage`'s refusal rule.** `attachExisting != null` is already its
  fourth disjunct and the rule is documented as complete.
- **Blob layout stays flat.** A photograph's folder is a column, not a blob prefix — so a rename is
  one UPDATE rather than an O(files) copy-and-delete. The `nina_folders` table does not change
  this: it declares that a *path* is a folder, and holds no bytes, no counts and no photographs.
  `scripts/blob-reap.mjs` still does not know the `nina/` prefix (ruling D4's open card); this plan
  does not close it.
- **An empty subdirectory inside a *dropped* folder is still lost.** The browser hands over a flat
  file list, so `planFolderUpload` never learns that a directory with nothing in it was there. Only
  **New subfolder** creates a durable empty folder. This is a smaller gap than the one the
  `nina_folders` table closed, and it is a browser-API limit rather than a decision.
- **No multi-user story.** One admin, one `userId`, every read and write scoped to it.

## Invariants

Every phase must hold all of these. They are the repo's, not this plan's inventions.

1. **The tree builds and `npm test` passes at the end of every phase.** `npm run typecheck`,
   `npm run lint`, `npm run format:check`, `npm test` — plus the `ci:*-guard` scripts that
   `.github/workflows/ci.yml` runs.
2. **`requireAdmin()` is line 1 of every `/admin` page and every album Server Action;
   `requireAdminApi()` is the first thing in the Route Handler, before `handleUpload`.**
   `proxy.ts` matches neither `/admin` nor `/api/*`, so these calls *are* the boundary.
3. **A userId in a blob pathname is interpolated from the session, never read from the request.**
4. **No model call is awaited in a render path.** Invariant 4, enforced by a CI grep.
5. **A description reaches Nina as text, never as an image**, and `description` is never rendered
   in `components/` — it is her prompt's private input.
6. **UI behaviour worth testing is a pure function in `lib/`.** vitest is `environment: 'node'`
   with no jsdom, so the folder walk decides *nothing* inside a `setState` updater — decide
   purely, set, then run the effects (`lib/nina/images.ts`'s `planNinaPicked`, and F17's measured
   double-upload bug, are the precedent).
7. **Exactly one current avatar, always.** `nina_avatars_user_current_unq` makes two impossible;
   writers un-current before they current, and the current row cannot be deleted.
8. **Every rendered number and string comes from `lib/format.ts`.**
9. **No `NEXT_PUBLIC_` anything.** `shareOrigin()` is `server-only`; the origin crosses to the
   client as a prop.
10. **A miss on an owned-blob pointer is a refusal, not a degradation.** `resolveAttachment`'s
    stated rule: an id that is not his means the whole send was about a photo he cannot see.
11. **Neither folder source is authoritative, and nothing reads `nina_folders` alone.** A folder
    exists if a photograph is filed in it **or** if it is declared; `listNinaAvatarFolders` is the
    one function that answers the question and it UNIONs both. A query that trusted only the
    declarations would hide every folder created by dropping one — the ordinary way folders arrive
    — and a `photos: 0` entry is a legal result no consumer may filter out. The corollary is the
    one ordering rule the table adds: **undeclare a subtree only when it is actually empty.**

## Phases

| # | Title | Satisfies | Package | Files | Depends on | Difficulty | Plan | TaskID | Card |
|---|-------|-----------|---------|-------|-----------|------------|------|--------|------|
| 1 ✅ | Folder metadata on `nina_avatars`, and the folder-aware data layer | R1 | `lib/db`, `lib/nina`, `lib/admin`, `drizzle`, `app/admin` | 9 | — | NORMAL | `lib/db/.workflows/plan/P1-DB-A000.md` | `P1-DB-A000` | `#66` |
| 2 ✅ | The pure file-tree library: image filter, path grammar, tree build, upload diff | R1 | `lib/admin`, `tests` | 2 | — | NORMAL | `.workflows/plan/admin-album-file-manager/phase-2.md` | `P1-RI-A000` | `#67` |
| 3 ✅ | The chat side of "share link to Nina": the `?photo=` idiom, composer chip, `attachExisting` | R2 | `lib/nina`, `app/nina`, `components/nina`, `tests` | 7 | — | NORMAL | `.workflows/plan/admin-album-file-manager/phase-3.md` | `P1-RI-A001` | `#68` |
| 4 ✅ | Folder-aware upload: batch register, thumbnails, and the describe pre-pass off the hot path | R1, R2 | `lib/admin`, `app/api/admin`, `lib/nina`, `tests` | 5 | 1, 2, 3 | HARD | `.workflows/plan/admin-album-file-manager/phase-4.md` | `P1-RI-A002` | `#69` |
| 5 ✅ | The file explorer: tree, breadcrumb, paginated grid, drop zone, upload queue, set-as-profile | R1 | `components/admin`, `app/admin`, `lib/admin` | 14 | 4 | HARD | `.workflows/plan/admin-album-file-manager/phase-5.md` | `P1-RI-A003` | `#70` |
| 6 | Folder maintenance: create, rename, move, delete | R1 | `lib/admin`, `components/admin`, `tests` | 7 | 5 | NORMAL | `.workflows/plan/admin-album-file-manager/phase-6.md` | `P1-RI-A004` | `#71` |
| 7 ✅ | "Share link to Nina" in the explorer, opening the chat in a new tab | R2 | `lib/admin`, `components/admin`, `app/admin`, `tests` | 6 | 3, 5 | EASY | `.workflows/plan/admin-album-file-manager/phase-7.md` | `P1-RI-A005` | `#72` |

**Board:** parent card **#65**, with these seven as its sub-issues in phase order
(#66…#72). One parent rather than one per requirement because phase 4 serves both R1 and
R2 — see the Requirements table.

Concurrency the `Depends on` column declares: **{1, 2, 3} run together**, then **4**, then **5**,
then **{6, 7} run together**. That is unchanged from the draft even though phase 4 gained a
dependency on phase 3 — the group already had to finish before 4 began, so nothing serialises that
was not already serial. Phase 3 remains deliberately unhooked from the *front* of the file-manager
chain: R2's chat half does not need a folder to exist, and it is independently shippable.

**File counts are the reconciled ones and differ from the drafts** in four places, each because the
reconciler moved work rather than because a planner miscounted: phase 1 gained
`app/admin/page.tsx` (an unowned read this work makes hundreds of times larger); phase 4 gained
`lib/nina/actions.ts` (the `resolveAttachment` gap); phase 5 gained
`components/admin/CropStudio.tsx` (a docstring naming a file it deletes) and
`lib/admin/ninaAlbumActions.ts` (retiring the singular register action with its last caller); phase
7 gained `components/admin/explorer/SelectionPane.tsx` (phase 5 put the per-photo action list
there, not in `FileExplorer.tsx`). Phase 6 lost `lib/admin/folderPath.ts` and gained the second of
phase 5's two explorer files.

### Phase 1 — Folder metadata on `nina_avatars`, and the folder-aware data layer
**Satisfies:** R1
**Owns:**
- `lib/db/schema.ts`: five columns on `ninaAvatars` — `folder text NOT NULL DEFAULT ''`, `filename`,
  `source_key`, `thumb_url`, `thumb_pathname` — plus `nina_avatars_user_folder_created_idx` and the
  UNIQUE `nina_avatars_user_source_key_unq` on `(user_id, source_key)` that makes the dedupe key a
  *constraint* rather than a convention, so a double-submitted upload cannot insert twice.
- `drizzle/0003_nina_avatar_folders.sql` and the `drizzle/meta` snapshot + journal entry, generated
  by `npm run db:generate`. Existing rows default to the album root — a default, not a backfill
  script (`419167d` is the precedent for knowing the difference).
- `lib/nina/queries.ts`: **nine** statements — a folder-scoped `{ limit, offset }` page returning
  `{ rows, total }`; the folder-subtree manifest; a distinct-folder listing with direct counts; an
  album count; a plain batch insert that never touches `is_current`; and the bulk-move / rename /
  recursive-delete / bulk-delete set phase 6 drives. Plus the widened `NinaAvatarRow`,
  `avatarColumns`, and `deleteNinaAvatar`'s return.
- `lib/admin/avatars.ts`: the thumbnail's upload cap, pathname builder and request predicate beside
  the existing `isAdminAvatarRequestPathname`. **No folder grammar** — that is phase 2's.
- `lib/nina/album.ts`: `NINA_ALBUM_MAX = 60`'s docstring restated as what it now is (a render cap on
  `/nina/about`'s mobile grid), plus `NINA_ADMIN_PAGE_SIZE = 120`, `NINA_ADMIN_MANIFEST_MAX = 2000`
  and `NINA_ADMIN_BATCH_MAX = 50`.
- `app/admin/page.tsx`: the hub stops reading the whole album to print its size.

**Does not touch:** any file under `components/`, `lib/admin/ninaAlbumActions.ts`,
`lib/admin/schema.ts`, `lib/admin/filetree.ts`, `lib/nina/crop.ts`, or `lib/nina/actions.ts`. No UI
in this phase, and **`listNinaAvatars` keeps its exact behaviour** — it is not capped, paginated or
given a required options argument, because phase 7's Requires #5 shows that capping it would turn
every share link for an older photo into a refusal.
**Exit criteria:** `npm run db:generate` produces exactly one new migration and it is additive (five
`ADD COLUMN`, two `CREATE INDEX`, no `UPDATE`); `npm run db:check` passes; `npm run typecheck` and
`npm test` are green; `is_current` has exactly three writers in `lib/nina/queries.ts`, one of which
writes only `false`; `/admin/nina` renders exactly as it does today, because no consumer of the new
columns exists yet; `/admin`'s album card renders the same sentence from a `count(*)`.

### Phase 2 — The pure file-tree library
**Satisfies:** R1
**Owns:**
- `lib/admin/filetree.ts`, pure and **zero-import** — the `lib/nina/images.ts` and `lib/nina/album.ts`
  shape, for their stated reason (invariant 6). **It is the repo's one folder-path grammar**: the
  bounds, the normaliser, `validateFolderPath`, the fold, and the path arithmetic that phases 4, 5
  and 6 all import.
  - the image test: *"during uploading, it automatically only upload image files"* — decided from
    the MIME type with an extension fallback, because a `File` from a directory walk can arrive
    with an empty `type`
  - path normalisation and validation: Windows `\` separators, `.`, leading/trailing/doubled
    slashes, empty segments, case folding for comparison, depth and length bounds, and the reserved
    characters a folder name may not contain. `..` **survives** normalisation so that exactly one
    function decides its fate
  - `buildTree(entries)` → one root `FolderNode` with `ownCount` / `totalCount`, synthesising the
    intermediate folders the distinct-folder query never returns
  - **`planFolderUpload({ base, files, manifest, maxBytes })`** — the requirement's "optimization":
    partition a walked folder into *to upload*, *already there* (matched on the dedupe key),
    *rejected* (not an image), and *refused* (over the size cap, over a bound, unnamed). This is
    where "automatically upload only the new folders and files" is actually decided
  - the dedupe key: `v1|<bytes>|<epochSeconds>|<folded relative path>`, so the same function
    computes it on the client and the server compares strings
  - breadcrumb, ancestor and subtree helpers for the explorer and for folder maintenance
- `tests/admin.filetree.test.ts` — the diff, the path grammar, the Windows-separator cases, the
  empty-MIME fallback, every bound's boundary, and the ruling-A6 assertion that this module's
  ext/content-type unions still agree with `lib/admin/avatars.ts`.

**Does not touch:** anything else. It declares the row shapes it needs *structurally* (the
`AvatarLike` idiom) rather than importing from `lib/db`, which is what keeps it independent of
phase 1.
**Exit criteria:** `grep -n "^import" lib/admin/filetree.ts` prints **nothing**; `npm test` green
with the new suite; `npm run lint` clean; no consumers yet.

### Phase 3 — The chat side of "share link to Nina"
**Satisfies:** R2
**Owns:**
- `lib/nina/attach.ts`: a second query-parameter idiom beside `ATTACH_PARAM` — `PHOTO_PARAM`, and
  the pure `formatNinaPhotoParam` / `parseNinaPhotoParam` pair for `kind:id`, so the admin page and
  the chat page cannot spell the deep link differently.
- `tests/nina.attach.test.ts`: the round trip, the rejections, and the hostile inputs a
  `searchParams` value can actually be.
- `app/nina/page.tsx`: read the new parameter, resolve it to `{ kind, id, url }` with an
  **owner-scoped single-row read** as a fourth element of the existing `Promise.all` (a miss yields
  `null` and the composer simply is not armed), and pass it to `ChatScreen`. No model call, no extra
  unindexed query — invariant 4.
- `lib/nina/queries.ts`: `getNinaMessageImage(userId, id)` in §6 (message images), deliberately
  ~320 lines away from the §9 region phase 1 edits.
- `components/nina/PhotoAttachmentChip.tsx`: the chip — a 56 px thumbnail, a 44 px clear button,
  `alt=""` and no `next/image`, both for reasons already ruled in writing.
- `components/nina/ChatScreen.tsx`: hold it as composer state exactly as `attachment` (the pinned
  run) is held; consume the parameter off the URL the same way `?attach=` is consumed (one
  `replaceState` deleting both, so a refresh does not re-arm it); pass `attachExisting` through to
  `sendNinaMessage`; render it in the optimistic bubble in the order the server writes the rows.
- `components/nina/Composer.tsx`: the chip, and one more disjunct in `canSend`, which **must**
  mirror the server's rule exactly (`components/nina/Composer.tsx:158-176` states why an enabled
  Send button that silently refuses is the specific bug to avoid here).

**Does not touch:** `lib/nina/actions.ts` (the `attachExisting` field and `resolveAttachment`
already exist and are correct; phase 4 makes the one efficiency edit),
`lib/nina/albumActions.ts`, `components/nina/NinaAboutScreen.tsx`, or anything under `/admin`.
**Exit criteria:** `/nina?photo=avatar:<id>` paints with the photo chipped in the composer; sending
with an empty box works and writes one `nina_message_images` row pointing at the existing blob with
**zero** new bytes in Blob and zero vision calls; a forged or foreign id arms nothing and is not an
error page; `/nina/about`'s attach flow is untouched; `npm test` and `npm run typecheck` green.

### Phase 4 — Folder-aware upload
**Satisfies:** R1, and one line of R2 (see the Requirements table)
**Owns:**
- `lib/admin/schema.ts`: the folder-path schema — `validateFolderPath` plus a `path === value`
  identity check, so the server **refuses** a non-canonical path rather than repairing one — the
  filename and dedupe-key schemas, the **batch** register schema (an envelope holding one array of
  per-file records, each carrying folder, filename, dedupe key, dimensions, bytes and a nullable
  thumbnail pair), and the batch bound. **Every constant imported, none declared.**
- `app/api/admin/nina/upload/route.ts`: accept the thumbnail pathname shape alongside the avatar
  one, with a smaller `maximumSizeInBytes`, and cross-check the pathname's extension against the
  declared content type. **The auth block above `handleUpload` does not move**, and the userId stays
  interpolated from the session.
- `lib/admin/ninaAlbumActions.ts`:
  - `registerNinaAvatarsAction` — the batch writer, going through phase 1's plain insert, so a
    300-file upload does not rewrite the current row 300 times. Idempotent on the dedupe key's
    unique index, so a retried batch is a no-op rather than a duplicate.
  - `listNinaAlbumManifestAction` — the manifest read the client calls **before** walking, so the
    diff has something to compare against.
  - **Take `describeNinaImages` off the register path.** It becomes `after()`-scheduled on the two
    paths that actually need a description (a photo becoming her face; a photo being shared) plus
    on demand, each non-fatally, exactly as the register path was non-fatal.
  - `ensureNinaAvatarDescriptionAction` — the in-band, skip-if-present variant phase 7 calls.
  - the thumbnail's **second `del()`** in `deleteNinaAvatarAction`: the phase that writes the second
    object owes the second delete.
  - keep `registerNinaAvatarAction` (singular) working; phase 5 retires it with its last caller.
- `lib/nina/actions.ts`: `resolveAttachment` only — two list-and-find ownership checks become two
  single-row lookups. The refusal rule at `:277` is not touched.

**Does not touch:** `components/**` (phase 5 owns every consumer), `lib/db/schema.ts`,
`lib/nina/queries.ts`, `lib/nina/album.ts`, `lib/admin/avatars.ts` (phase 1 owns all four),
`lib/admin/filetree.ts` (phase 2 — imported, never edited), `lib/nina/vision.ts`.
**Exit criteria:** a batch of N records writes N rows in one action with `is_current` untouched
(unless the album had no current row, in which case exactly one is promoted); re-sending the same
batch writes nothing new; the Route Handler still 404s a signed-in non-admin and 401s a signed-out
one, and mints thumbnail tokens at the 512 KB cap; **no `glm-4.6v` call happens on any upload**;
deleting a photo with a thumbnail removes both Blob objects; `resolveAttachment` resolves by
primary key; `/admin/nina` still renders (the old screen is still the consumer at this point).

### Phase 5 — The file explorer
**Satisfies:** R1
**Owns:**
- `app/admin/nina/page.tsx`: folder-scoped, paginated reads driven by `searchParams` (`?folder=`
  validated through `validateFolderPath`, and a bounded `?page=`), the tree's distinct-folder read,
  and the new props. Stays a Server Component, stays `force-dynamic`, keeps `requireAdmin()` on
  line 1.
- `components/admin/FileExplorer.tsx` and its five children under `components/admin/explorer/` —
  the view models, the thumbnail derivation, the directory walk, the upload hook, the tree pane, the
  content grid, the selection pane and the queue bar:
  - the **directory picker** (`webkitdirectory` — set imperatively via a ref, since React's typings
    do not carry the attribute) reading `File.webkitRelativePath`
  - the **Explorer drag-and-drop**: `DataTransferItem.webkitGetAsEntry()` captured *synchronously*
    in the drop handler, and a recursive `createReader().readEntries()` walk that **loops until
    `readEntries` returns an empty array** — it batches at 100, and stopping at the first call is
    the silent-truncation bug in every naive implementation. Noted in the code, not just here.
  - the diff: read the manifest, call phase 2's `planFolderUpload`, then upload only what came back
    as new — and report the skipped count, because a drop that uploads nothing must say so rather
    than looking broken
  - the thumbnail derivation, client-side, via `createImageBitmap` + `OffscreenCanvas`, uploaded as
    a second blob beside the original. The original is **not** re-encoded.
  - a bounded-concurrency queue (four parallel PUTs, not `Promise.all` over 300 files) with per-file
    state, a total progress line, and per-file failures that do not fail the batch. Register calls
    are chunked at `NINA_ADMIN_BATCH_MAX` *as they land*, so a tab closed at file 290 leaves 250
    rows rather than 300 orphaned blobs. F17's measured double-upload bug is the reason nothing
    decides inside a `setState` updater.
  - selection, the framing studio for the selection (extracted from `AlbumManager`, unchanged in
    behaviour), and **"Set as profile picture"** — R1's last clause.
- Retire `components/admin/AlbumManager.tsx` and `components/admin/UploadAvatar.tsx`, and with them
  `registerNinaAvatarAction` (singular) in `lib/admin/ninaAlbumActions.ts` — in one commit, so the
  tree never holds two upload paths or a Server Action nothing calls. Plus one stale docstring line
  in `components/admin/CropStudio.tsx`, which names a file this phase deletes.

**Does not touch:** `lib/admin/schema.ts`, `lib/nina/queries.ts`, `lib/nina/album.ts`,
`lib/admin/avatars.ts`, `lib/db/schema.ts`, `app/api/admin/nina/upload/route.ts` (phases 1 and 4 own
them), `lib/admin/filetree.ts` (phase 2), `components/admin/CircleFrame.tsx` (reused verbatim),
`components/admin/AdminNav.tsx`, `app/admin/layout.tsx`, `lib/format.ts`, anything under
`components/nina/`. `lib/admin/ninaAlbumActions.ts` is read only for the one deletion named above.
**Exit criteria:** a nested folder picked from the picker and the same folder dragged from Explorer
both produce the same tree; a folder with **more than 100 files in one directory** uploads all of
them; re-dropping uploads nothing and says so with a count; non-images are skipped and counted; the
grid of hundreds issues only thumbnail requests and never an original; clicking a photo selects it
and one click makes it her profile picture; the framing studio still saves and resets a crop;
`AlbumManager.tsx` and `UploadAvatar.tsx` no longer exist and nothing references them;
`npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check` green.

### Phase 6 — Folder maintenance
**Satisfies:** R1
**Owns:** the create / rename / move / delete folder actions plus the photo move and remove in
`lib/admin/ninaAlbumActions.ts` (each `requireAdmin()`-gated, Zod-validated against phase 4's
`folderPathSchema`, going through phase 1's statements), the pure refusal decisions and their unit
tests in `lib/admin/folderOps.ts` + `tests/admin.folderOps.test.ts`, their affordances in
`components/admin/FolderMenu.tsx` and `components/admin/PhotoMoveBar.tsx`, three insertions at
phase 5's two marked seams, and the two rules that make delete safe: **the current photo cannot be
removed** (`is_current = false` is in every delete's WHERE, and the action turns that into a
refusal that names the photo and offers the second answer rather than half-succeeding), and a
recursive delete removes rows first and blobs best-effort in chunks of 100, logged, exactly as
`deleteNinaAvatarAction:176-183` argues. Moving a photo or a folder is an UPDATE of the folder
column; **no blob is copied**.
**Does not touch:** the upload path, the schema, `lib/nina/queries.ts` (it calls phase 1's
statements and adds none), `lib/admin/filetree.ts` (phase 2 — imported), `app/admin/nina/page.tsx`,
`components/admin/explorer/SelectionPane.tsx`'s per-photo action list (phase 7's seam), phase 5's
selection model, or anything under `components/nina/`.
**Exit criteria:** rename, move and recursive delete all work and are reflected in the tree without
a manual reload; a folder holding the current photo refuses deletion with a message that names the
photo and the reason, and the second answer then leaves that folder holding exactly that one photo;
no folder operation changes the Blob store's object count except a delete; `npm test` and
`npm run typecheck` green.

### Phase 7 — "Share link to Nina" in the explorer
**Satisfies:** R2
**Owns:** `lib/admin/shareToNina.ts` (the one place an avatar id becomes a chat URL, built through
phase 3's formatter so the two ends cannot disagree), `components/admin/ShareToNinaItem.tsx`, the
one item at phase 5's marked seam in `components/admin/explorer/SelectionPane.tsx`, the
`shareOrigin` prop threaded from `app/admin/nina/page.tsx` through `FileExplorer`, and
`tests/admin.shareToNina.test.ts` — whose round trip through phase 3's own parser is the only thing
that can catch the two halves of R2 compiling while disagreeing about the grammar. The click opens
`<origin>/nina?photo=avatar:<id>` in a **new browser tab** — the user's words: *"automatically open
runins.site chat in a new browser tab"* — with `'noopener'`, and it **opens the tab before awaiting
anything**, because `window.open` after an `await` has lost the user gesture. `shareOrigin()` is
`server-only` (`lib/share/origin.ts:1`), so the page reads it and passes it down; invariant 9
forbids a `NEXT_PUBLIC_` for it. Nothing is sent from `/admin` — the composer arrives armed by
phase 3, and the optional question is typed in the chat where the user can see her answer. If the
photo has no `description` yet, `ensureNinaAvatarDescriptionAction` is fired (not awaited) before
opening, non-fatally, so *"nina will respond to it accordingly"* has something true to work from.
**Does not touch:** `lib/nina/**`, `components/nina/**`, `app/nina/**` (phase 3 owns the chat half),
`lib/admin/ninaAlbumActions.ts` (it calls one existing action and adds none), phase 5's selection
model, or phase 6's per-folder menu. No new Server Action is needed for the pointer itself.
**Exit criteria:** clicking the item opens **one** new tab at the production origin, with
`window.opener === null`; the chat there shows the photo chipped in the composer; sending with or
without text produces a reply; **no image bytes are re-uploaded** (verifiable in the Blob store's
object count, before and after); an un-described photo gets described without the tab waiting for
it, and a describe failure blocks nothing; `npm test` and `npm run typecheck` green.

## Reconciliation Log

One round. The seven planners ran concurrently and could not see each other's work (phase 4 alone
ran late enough to read phase 1's finished plan), so their interface contracts disagreed in
thirteen places. Every one was resolved by editing the phase files in place; the resolutions are
also written into the phase plans at the sites they affect, marked `RECONCILED (round 1)`.

| # | Conflict | Phases | Resolution |
|---|---|---|---|
| 1 | The folder-path grammar was declared **three times** — bounds + `isAdminAvatarFolderPath` in `lib/admin/avatars.ts`, bounds + helpers in `lib/admin/filetree.ts` with *different values*, and a third copy in a new `lib/admin/folderPath.ts` | 1, 2, 6 | Collapsed onto **`lib/admin/filetree.ts`**, the only workable home: it is the unit-tested module and must stay zero-import (invariant 6, `environment: 'node'`), so it cannot import bounds from `avatars.ts`; and phase 6 established that **nothing under `components/` reaches `zod`** today, so a `'use client'` file needs a path module that drags no validator into the `/admin` bundle. `folderPath.ts` deleted, its two needed functions (`isInFolderTree`, `sanitiseFolderSegment`) moved into `filetree.ts`. `avatars.ts` declares no folder bounds and **does not re-export them** — a re-export is a second name for one value. Phase 4's `folderPathSchema` now wraps `validateFolderPath` instead of being a second regex. |
| 2 | Pagination shape: phase 1 built a **keyset cursor** (`NinaAvatarCursor`, `NinaAvatarPage`); phase 5 built an **offset pager** against `{ rows, total }` + `{ limit, offset }` and flagged the contradiction rather than adapting | 1, 5 | **Phase 5 won, and phase 1 moved.** A file manager's pager says *"121–240 of 314"* and offers **Newer** as well as **Older**; a keyset cursor gives up both the count and the backward walk. At the stated scale (*"hundreds"*) `OFFSET` on `nina_avatars_user_folder_created_idx` is an index range scan — the deep-offset pathology needs tens of thousands of rows. `?page=` is also a bounded integer a human can read, type and bookmark. `NinaAvatarCursor`/`NinaAvatarPage` are not created; `NinaAvatarFolderPage { rows, total }` replaces them, and what the cursor was right about is recorded in `listNinaAvatarsInFolder`'s docstring as a named, bounded consequence rather than dropped. |
| 3 | `NINA_ADMIN_PAGE_SIZE`: phase 1 wrote `120`, phase 5 assumed `60` | 1, 5 | **120**, phase 1's number, with phase 5's grid rewritten to it. |
| 4 | `planFolderUpload` arity: phase 2 made `maxBytes` a required third positional parameter; phase 5 assumed two arguments with the caps owned internally | 2, 5 | Neither — **a single options object**: `planFolderUpload({ base, files, manifest, maxBytes })`, with `maxBytes` passed as `ADMIN_AVATAR_MAX_UPLOAD_BYTES` from `lib/admin/avatars.ts:43` so the 8 MB cap is never spelled at a call site. `base` is separate because a walk is always rooted somewhere. |
| 5 | Phase 5 assumed five of phase 2's export names and three of its shapes | 2, 5 | **All eight are phase 2's to keep**, and phase 5's steps were rewritten: `ancestorsOf`→`folderAncestors`; `breadcrumbFor`→`folderBreadcrumbs` (crumbs are `{ path, name, depth, isCurrent }`, not `{ label, folder }`); `uploadableContentType`→`classifyFile` (a verdict union, not a nullable content type); `UploadRefusalReason`→`UploadRefusal`, widened to ten members; `buildTree` returns **one root node**, not an array, with counts `ownCount`/`totalCount`. |
| 6 | Batch-cap name and home: phase 1 put `NINA_ADMIN_BATCH_MAX` in `lib/nina/album.ts`; phase 5 insisted on `ADMIN_AVATAR_REGISTER_MAX` out of `lib/admin/schema.ts` because `schema.ts` pulls `zod` into the client bundle | 1, 4, 5 | **`NINA_ADMIN_BATCH_MAX` in `lib/nina/album.ts`.** Phase 5's constraint was about `schema.ts` specifically, and `album.ts` is already the pure zod-free module this repo puts such numbers in (`lib/nina/album.ts:49-62` argues exactly this for `NINA_ATTACH_MAX_CHARS`), so both requirements hold with one name. |
| 7 | `AdminActionResult` looked like a two-writer collision needing a union | 4, 6 | **No collision.** Phase 4 does not append to the interface — it declares `AdminBatchRegisterResult` and `AdminManifestResult` that **extend** it, which is the better shape because `inserted` and `entries` belong to one action each. Phase 6 is the interface's only editor: `folder?`, `count?`, `note?`, all additive. |
| 8 | `NinaAvatarBatchRecordLike` had two legal homes and phase 5 asked for a ruling | 2, 4, 5 | Neither of the two proposed: the batch-record type is exported from the actions module as `AvatarBatchRecord` and imported as a **type**, so the shape has one owner and no runtime import crosses the boundary. |
| 9 | **`resolveAttachment` resolved an avatar via an unbounded `listNinaAvatars(userId).find(...)`** — a full-album read per send. Phases 3 and 7 both found it; neither was permitted to open `lib/nina/actions.ts`; phase 7 escalated it as the one R2 failure a green CI cannot see | 3, 4, 7 | **A genuine gap — now phase 4's Step 6.** Confirmed first that phase 1 leaves `listNinaAvatars` un-`LIMIT`ed, so the hazard is a cost and not yet a correctness bug. The two-line fix uses `getNinaAvatar` plus phase 3's new `getNinaMessageImage`, which is why **phase 4 now depends on phase 3** and why the Requirements table gives phase 4 to R2 as well as R1. |
| 10 | **The thumbnail blob leak.** `deleteNinaAvatarAction` deletes only the original, so from the moment thumbnails exist every removed photo strands one. Phase 1 handed it to phase 6; phase 6's plan explicitly declines to touch that action | 1, 4, 6 | **Assigned to phase 4**, the phase that starts *writing* thumbnails. Leaving it to phase 6 would have shipped a leak between the two with nobody's name on it. |
| 11 | Delete semantics: phase 1's `deleteNinaAvatarFolder` refused the whole subtree when it held the current photo; phase 6 wanted a `keepCurrent` policy | 1, 6 | The refusal moved **out of the data layer**. `deleteNinaAvatarsInFolderTree` deletes every non-current row and returns blob refs (`is_current = false` stays in the WHERE, so invariant 7 is unreachable from there); phase 6's action reads `getCurrentNinaAvatar` and decides whether to ask first. Two plural statements phase 6 needed and was forbidden to add — `deleteNinaAvatars`, `moveNinaAvatarsToFolder` — were a second gap, and are now phase 1's; the singular `moveNinaAvatarToFolder` is dropped as subsumed. |
| 12 | Three stale docstrings referencing files phase 5 deletes (`AlbumManager`, `UploadAvatar`) | 1, 5 | All three owned, none left stale: `components/admin/CropStudio.tsx:29` to phase 5, `lib/admin/avatars.ts:7` and `:19` to phase 1. |
| 13 | `app/admin/page.tsx:20` reads the **whole album** — every column of every row, `description` prose included — to render one integer, on a `force-dynamic` page | 1, 5 | **A gap no phase owned**, and this plan set is what makes it hurt. `countNinaAvatars(userId)` added in phase 1 (the phase that owns the query layer) and swapped in at the one call site, landing before the album grows. |

Two of phase 5's nine guesses **won** the argument and moved an earlier phase instead of yielding
to it — the pagination shape and the batch bound's home. That is the outcome to expect from a
consumer that was written against a contract it could not read: sometimes the consumer is right.

Also dropped in reconciliation: phase 1's `ADMIN_AVATAR_THUMB_EDGE_PX`, because nothing on the
server reads a thumbnail edge length. That number belongs to the only module that agrees with it,
phase 5's `components/admin/explorer/thumbnail.ts` (`EXPLORER_THUMB_SHORT_EDGE_PX = 256`).

### After reconciliation: `nina_folders`, by the owner's decision

The reconciled plan shipped **without** a folders table and recorded that as a decided limitation:
a created empty folder would not survive a reload, phase 6 would mitigate it on screen with
create → navigate → upload, and the table was filed as a follow-up card because *"it is a schema
decision for the user to make, not one a reconciler should invent."* **The owner made it: build
the table, in phase 1.** This section records what that changed, because it is the one edit to the
plan set that did not come from the reconciler.

| Where | Change |
|---|---|
| **Phase 1** — `lib/db/schema.ts` | New Step 2b: the `nina_folders` table — `(user_id, folder)` composite primary key (the `nina_nags` idiom at `:1035`), FK to `users` `on delete cascade`, `created_at`, and the row types. The album root `''` is never stored. |
| **Phase 1** — `drizzle/0003` | The migration gains one `CREATE TABLE` and its FK. Still no `UPDATE`, no `ALTER COLUMN`, no `DROP`. The table is created **empty and nothing backfills it** — every folder that exists today is carried by its photographs. |
| **Phase 1** — Step 9 | `folderSubtree` **signature widened** to take the folder column as its first argument, because `nina_avatars.folder` and `nina_folders.folder` must share one definition of "under this folder" or a rename drifts between them on exactly the `100%` folder name that motivated `left()` over `LIKE`. Four existing call sites updated; `PgColumn` imported type-only. |
| **Phase 1** — Step 12 | `listNinaAvatarFolders` **rewritten as a UNION** of the two sources via `db.batch`, merged in a `Map` (declared first, populated second, so a folder that is both keeps its real count). Sorted by codepoint in JS rather than by `ORDER BY`, because a shorter string sorts before any string it prefixes and that is what guarantees parents precede their children — a Postgres non-C collation makes no such promise. |
| **Phase 1** — new Step 14b | `declareNinaFolders` (`ON CONFLICT DO NOTHING`, filters the root), `renameNinaFolderSubtree`, `deleteNinaFolderSubtree`. Policy stays in phase 6, exactly as reconciliation ruled for the delete statements. |
| **Phase 2** | No code change. `buildTree`'s docstring now states that `ownCount: 0` arrives two ways — synthesized, or **supplied** by a declared empty folder — so a zero must never be filtered upstream. Handoff 5 closed. |
| **Phase 4** | `registerNinaAvatarsAction` calls `declareNinaFolders` once per batch, **before** the insert, so a folder that arrived by being *dropped* is declared too and does not silently cease to exist when its last photograph is removed. |
| **Phase 6** | Three call sites and one docstring. `createNinaAlbumFolderAction` now **writes**, declaring the folder *and its whole ancestor chain* (so creating `a/b/c` cannot leave `a/b` able to vanish when `c` goes). `renameNinaAlbumFolderAction` rewrites declarations **after** the rows. `deleteNinaAlbumFolderAction` undeclares **only when `current == null`**. `planFolderCreate`'s *"AN EMPTY FOLDER IS CLIENT STATE"* section is rewritten — it was the honest answer to the old design and is false against the new one. |

**The design question the table forced, and its answer.** The reconciler's objection was not the
cost — it correctly priced the table at "an insert on create, a delete on delete, and a join in the
tree read" — but the fifth item: *two writers that must never disagree with the photo rows.* The
answer is that **neither source is authoritative.** A folder appears in the listing if a photograph
is in it **or** if it is declared, so a populated folder with no declaration still appears (its
photographs carry it) and a declaration outliving its photographs appears as an empty folder, which
is now a legal state rather than a ghost. There is no repair path to write and no reconciliation job
to run, because no state exists in which one source is *wrong*.

**The one real trap it adds**, stated in three places on purpose (phase 1's
`deleteNinaFolderSubtree` header, phase 6's delete action, and phase 6's Requires note):
**undeclare a subtree only when it is actually empty.** Under `keepCurrent` the folder still holds
her current photograph, and undeclaring it there creates precisely the disagreement the UNION
absorbs — which means it would stay invisible until that last photograph left and the folder
silently disappeared. A read that tolerates inconsistency is a reason to be careful about creating
it, not a licence.

## Open Questions

**None.** Every contradiction resolved in round 1; no second round was needed.

One limitation is *decided* rather than open, and it is recorded in the phase plans that own it
rather than left as a question:

- **The dedupe key can collide.** It is `(folded path, size, mtime-to-the-second)`, so two
  *different* photographs of identical byte count at the same path in the same second look like one
  file. Phase 1's unique `(user_id, source_key)` index turns that into "the second file is skipped"
  rather than a bad row, and the key is version-prefixed (`v1|…`) so the derivation can be changed
  later without silently re-uploading the whole album. A content hash was rejected on cost: hashing
  hundreds of megabytes to answer "have I seen this?" costs more than the upload it saves.

## Rollback

**As a whole:** the work is on `feature/admin-album-file-manager`, so `git checkout main` reverts
every code change. The one thing a branch switch does not revert is phase 1's migration: back it
out with a hand-written `0004` that drops the added columns, the two indexes and the
`nina_folders` table. Every added column is additive and nullable-or-defaulted, so no existing
column is altered and dropping them destroys only data that could not have existed before.

**`DROP TABLE "nina_folders"` is the one genuinely destructive statement in the set.** Its rows are
folder declarations the operator made by hand through the UI — not derivable from anything else and
not recoverable. Every *populated* folder survives regardless, because `nina_avatars.folder` still
carries it; what is lost is exactly the empty folders, which is the feature the table adds. Prefer
leaving the table in place — it is inert if `listNinaAvatarFolders` reverts to its single-source
form — over dropping it after the operator has organised the album.

**Per phase:** each phase is a commit or a small run of commits on this branch and reverts
independently in reverse dependency order (7 or 6 first, then 5, 4, then 3, 2, 1). Phases 1, 2 and
3 are each shippable alone: 1 and 2 add unused capability, and 3 adds a working `?photo=` deep link
into the chat with no `/admin` change at all.

**Blobs:** an upload that failed between the PUT and the register action leaves an orphan in the
store. That is the same exposure the album has today (ruling D4's open card for
`scripts/blob-reap.mjs`), and it is *widened* by a batch upload — worth saying out loud, and worth
one line in phase 4's docstring pointing at that card rather than silently inheriting it.

## Next

Execute the phases one at a time, starting at phase 1:

    /implement -f ADMIN_ALBUM_FILE_MANAGER_PLAN.md --phase 1

Or run the whole set as a swarm — a session per phase, concurrent wherever `Depends on` allows,
resumable on any machine:

    /analyze-orchestrator -f ADMIN_ALBUM_FILE_MANAGER_PLAN.md

Or put them on the board first (GitHub repos only):

    /create-task --from-plan ADMIN_ALBUM_FILE_MANAGER_PLAN.md
