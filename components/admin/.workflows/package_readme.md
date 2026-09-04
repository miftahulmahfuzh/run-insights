# Package: components/admin

**Location**: `components/admin`
**Last Updated**: 2026-09-04

## Overview

`components/admin` is the view layer of `/admin/**`: the file manager that `/admin/nina` became, the
framing studio that decides how Nina's face sits in a circle, and the panes behind `/admin/memory`.
There is no data access, no validation and no vendor call in this directory. Reads arrive as props
from a Server Component; writes leave through a Server Action in `lib/admin`.

Most of it is `'use client'`, but **not all of it, and the exceptions are deliberate**. `AdminNav`,
`UserPicker` and `CircleFrame` carry no directive. The first two could only need one for active-link
highlighting, and `usePathname()` would make an entire sidebar client-rendered to bold one word — so
selection is expressed in the URL and conveyed with `aria-current` instead. `CircleFrame` holds no
state and imports only pure modules, so it renders on the server *and* compiles into the client graph
of whichever client component imports it.

It is a *desktop admin surface* package, and that is a deliberate exception to the rest of
`components/`. There is no `AppShell`, no `TabBar` and no 470 px column: `/admin` is stated as
desktop-only (*"admin page (desktop usage)"*), so `app/admin/layout.tsx` gives these components
~1080 px and they spend it on rails and a canvas. Tokens are still borrowed from the app's design
system rather than re-invented.

The organising rule is **invariant 6, read as a boundary**: anything decidable is a pure function
in `lib/`, because vitest runs `environment: 'node'` with no jsdom. What is left here is what
cannot be proved in Node — `DataTransferItem`, `FileSystemDirectoryReader`, `OffscreenCanvas`,
`ResizeObserver`, `PointerEvent`, `FileList` — plus the JSX that arranges it. That is why this
package has no test files and why that is correct rather than a gap: the judgements its screens make
(is this an image, is this path legal, do we already have it, may this folder move there, where does
this crop land) all live in `lib/admin/filetree.ts`, `lib/admin/folderOps.ts` and `lib/nina/crop.ts`
and are unit-tested there.

**Key Responsibilities:**

- Be `/admin/nina`'s file manager: folder tree, breadcrumb, folder-scoped paginated grid,
  drag-and-drop of nested folders, a directory picker, and a details rail.
- Maintain the tree it draws: create, rename, move and delete a folder from the row that names it,
  and move or remove the selected photos — the affordances only, with every refusal left on the
  server where the rule lives.
- Turn a gesture into a list of files with paths, using the two non-standard browser APIs that can
  do it, and produce the *same* shape from a drop as from a picker.
- Derive a 256 px thumbnail in the browser, because nothing on the server re-encodes these blobs.
- Run a bounded, resumable upload queue that registers rows in chunks as files land.
- Own the framing studio and the sanity circles, at the sizes the chat actually draws.
- Hand a photo to her chat as a **pointer, in a new tab**, getting the order inside one click right:
  fire the describe, then open the tab, await neither before the other.
- Render `/admin/memory`'s ledger and slot editor.
- Never render `description`. Invariant 5 — it is her prompt's private input, and this package shows
  only *whether* it exists.

## Module map

| File | Kind | Purpose |
|---|---|---|
| `FileExplorer.tsx` | `'use client'` | The screen. Layout, toolbar, breadcrumb, drop target, the URL grammar. |
| `explorer/model.ts` | **types only**, no directive | The props contract between the Server Component and the explorer. No runtime export at all. |
| `explorer/dropWalk.ts` | browser APIs, no directive | `webkitGetAsEntry()` capture, the `readEntries` pump, the `webkitdirectory` picker. Decides nothing. |
| `explorer/thumbnail.ts` | browser APIs, no directive | One decode: intrinsic size out, 256 px JPEG out. |
| `explorer/useFolderUpload.ts` | `'use client'` hook | One gesture end to end: walk, diff, four-lane upload, chunked register. |
| `explorer/FolderTree.tsx` | `'use client'` | The folder rail. Every row is a `<Link>`. |
| `explorer/PhotoGrid.tsx` | `'use client'` | One folder's page of square tiles, plus the pager. |
| `explorer/SelectionPane.tsx` | `'use client'` | The details rail: framing, facts, and the action list. |
| `explorer/UploadQueue.tsx` | `'use client'` | One honest line about what the upload is doing. |
| `FolderMenu.tsx` | `'use client'` | One folder's four verbs: New subfolder / Rename / Move to… / Delete. A `mode` union, four `absolute` panels. Decides nothing. |
| `PhotoMoveBar.tsx` | `'use client'` | Move or remove the current selection. Reads phase 5's `selectedId`, never writes it. `null` when nothing is selected. |
| `ShareToNinaItem.tsx` | `'use client'` | "Share link to Nina". Opens the chat in a new tab; fires the describe and never awaits it. |
| `CropStudio.tsx` | `'use client'` | Drag / wheel / slider / arrow keys. Contains one subtraction. |
| `CircleFrame.tsx` | **no directive** | A stored crop rendered as a circle at any size. Stateless, pure imports. |
| `AdminNav.tsx` | **no directive** | The `/admin` nav. No active-link highlighting, on purpose. |
| `MemoryLedger.tsx` | `'use client'` | `/admin/memory`'s fact ledger: insert, edit, retract, purge. |
| `MemorySlots.tsx` | `'use client'` | `/admin/memory`'s slot editor, plus the pending-promises panel. |
| `UserPicker.tsx` | **no directive** | Whose memory is being edited. Plain links, selection in the URL. |

## The `/admin/nina` file manager

### What lives in the URL and what lives in state

This screen holds both kinds of state at once, and the split is a rule rather than an
inconsistency:

- **`?folder=` and `?page=` are in the URL**, because they decide *which rows exist*. The page must
  re-run `listNinaAvatarsInFolder` for them, so a folder click is a real `<Link>` navigation — which
  also makes a folder deep-linkable and the back button meaningful, both of which a file manager
  owes its user.
- **The selected photo is `useState`**, for the reason `components/ui/usePanelParam.ts` gives about
  `/me`'s panel: putting it in the URL would re-run a Server Component that just did two database
  reads, on every click, for a state change that never leaves the client.
- **`pendingFolders` is `useState`, and it is not storage.** A folder the operator just created is
  *durable* — `createNinaAlbumFolderAction` declares it in `nina_folders` and
  `listNinaAvatarFolders` UNIONs the declarations with the folders the photograph rows imply, so a
  reload shows an empty folder. This state covers only the window between the action resolving and
  this component receiving a `folders` prop that includes it, during which the tree would otherwise
  navigate into a folder it cannot draw. The merge into `allFolders` is therefore a **filter, not a
  union**: once the server's list names a folder the pending copy is dropped, so it cannot survive a
  later rename of that folder.

The consequence worth knowing: `selectedId` can name a photo that is no longer on this page (a
folder change, a page change, a delete). `photos.find(...) ?? null` is the entire handling — the pane
closes itself — and no effect is needed.

The URL grammar has one home, `hrefForFolder` in `FileExplorer.tsx`, so the tree, the breadcrumb and
the pager cannot spell it differently. The root folder is the **absence** of `?folder=` and page 1 is
the **absence** of `?page=`, so canonical `/admin/nina` and navigated-back-to root are the same URL.

There are two ways out of that grammar, not one. `hrefFor` *builds* a URL, which is all a `<Link>`
needs; `navigateToFolder` *goes* to one, which is what a folder operation needs, because it only
learns where the explorer should be looking once the server has answered. Both go through
`hrefForFolder`, so the second way out is a `router.push` and not a second spelling.

### The two gestures produce one shape

```ts
export interface WalkedFile extends LocalFileLike {
  relativePath: string   // 'bali/day-2/DSC_0031.jpg' — not normalised, not prefixed
  file: File
}
```

A picker gives `File.webkitRelativePath` for free; a drop gives nothing until the entry tree is
walked by hand. Both end as `WalkedFile[]`, which is what lets the diff, the queue and the progress
bar have exactly one implementation — and what makes "a nested folder picked and the same folder
dragged produce the same tree" a property of the design rather than two things to test.

Because `WalkedFile extends LocalFileLike`, a `WalkedFile[]` goes into `planFolderUpload` with no
adapter, and because `PlannedUpload<T>.source` hands the caller's own object back, the `File` comes
out the far side of the diff still attached to its plan row. That is why `useFolderUpload` keeps no
`sourceKey -> File` map.

### Three browser-API hazards, each handled in one named place

**1. `entriesFromDrop` must be called synchronously.** A `DataTransferItemList` is only valid during
the dispatch of its own event. The moment the handler yields to the microtask queue the list is
emptied and `webkitGetAsEntry()` returns `null` for every item — so an `async` drop handler that
awaits anything at all sees an empty drop and silently uploads nothing. The `FileSystemEntry`
objects themselves stay valid indefinitely; only the item list does not. Hence the split:
`entriesFromDrop` is synchronous, `walkEntries` is not, and `FileExplorer`'s `onDrop` is deliberately
not `async`.

**2. `readEntries()` does not return the whole directory.** Chromium returns at most 100 entries per
call and signals the end with an **empty array**. The naive one-liner therefore truncates every
folder to its first 100 files with no error anywhere — on the "hundreds of profile pics" this feature
exists for, it would drop most of them. `readAllEntries` pumps the *same* reader (a reader is a
cursor; a fresh `createReader()` would start over) and resolves only on the empty batch.

**3. `webkitdirectory` cannot be a JSX prop.** React's `InputHTMLAttributes` does not carry it, so
writing it in JSX needs a cast that lies about the DOM. The DOM property is real and typed, so an
effect sets it on the ref after mount. Without that one line the file dialog cannot select a folder
at all — it is the entire directory picker, not a nicety.

Two ceilings bound a single gesture: `EXPLORER_WALK_MAX_FILES = 2000` and
`EXPLORER_WALK_MAX_DEPTH = 12`. The depth cap is deliberately *deeper* than the album's own folder
bound, because a file below the album's limit is refused by `planFolderUpload` with a reason the
operator reads, whereas a walk that stops early just makes files vanish. An unreadable file (a lock,
a permission, a OneDrive placeholder) is skipped with a warning, never thrown: one bad file must not
abort a three-hundred-file folder.

### The upload queue

```ts
export const EXPLORER_UPLOAD_CONCURRENCY = 4
export const EXPLORER_REGISTER_CHUNK = NINA_ADMIN_BATCH_MAX

export type UploadPhase = 'idle' | 'reading' | 'planning' | 'uploading' | 'finished'

export interface FolderUpload {
  phase: UploadPhase
  items: readonly QueueItem[]
  report: QueueReport | null
  error: string | null
  start: (walked: readonly WalkedFile[]) => void
  startWalk: (entries: readonly FileSystemEntry[]) => void
  dismiss: () => void
}

export function useFolderUpload(args: {
  userId: string
  destination: string
  onFinished: () => void
}): FolderUpload
```

**Decide, set, run — and nothing inside a `setState` updater.** This is F17's measured shape, not a
style preference: `reactStrictMode: true` double-invokes updaters in dev, so a decision made inside
one minted **two** upload tokens and wrote **two** blobs, one orphaned in the store forever. `run()`
gathers, awaits the manifest, calls one pure function, calls `setItems`/`setReport` with values, and
only then starts any effect.

**Bounded concurrency, not `Promise.all`.** Three hundred files through `Promise.all` would open
three hundred token-mint requests and three hundred simultaneous PUTs, decode three hundred images at
once, and report progress as one long pause followed by everything. Four lanes saturate a home
upstream link, keep at most four decoded bitmaps alive, and make the progress line mean something.
`runLanes` is four lines and no dependency: `next++` needs no lock, because JavaScript is
single-threaded and each lane only advances at an `await` boundary.

**Per-file failure is not batch failure.** A file that will not decode, is too small to frame, or
whose PUT 500s marks *that* item `error` and its lane moves on.

**Registering in chunks, as files land.** Records flush to `registerNinaAvatarsAction` every
`NINA_ADMIN_BATCH_MAX` completions rather than once at the end, so a tab closed at file 290 of 300
leaves 250 registered rows instead of 300 orphaned blobs. The action is idempotent on the dedupe
key's unique index, so a re-drop after a crash re-registers nothing and re-uploads only what is
missing — the same mechanism as "upload only the new files", applied to our own failure.

**The manifest is read for the destination subtree, not the whole album.** Dropping `bali/` into
`2026/` compares against what is under `2026/`, which is the only comparison that can be right: the
dedupe key folds in the path, so the same file dropped into two folders is two different files — and
it should be, because a photo's place in the tree is information the operator put there.

**The orphan exposure is named, not hidden.** An upload that dies between the PUT and its register
chunk leaves a blob no row points at. That is the album's pre-existing exposure and a batch upload
widens it, which is why `dismiss()` refuses to run while the queue is busy: throwing away the records
of in-flight PUTs would manufacture orphans on purpose.

A `runRef` gesture counter guards every write back into state, so a promise from a dismissed or
superseded run cannot patch the current queue.

### The derived thumbnail

```ts
export const EXPLORER_THUMB_SHORT_EDGE_PX = 256
export const EXPLORER_THUMB_QUALITY = 0.82
export const EXPLORER_THUMB_CONTENT_TYPE = 'image/jpeg'

export interface MeasuredFile { width: number; height: number; thumb: Blob | null }
export async function measureAndThumbnail(file: File): Promise<MeasuredFile>
```

`next/image` is ruled out for Blob-hosted photos across this repo — it would re-optimise finished
files on a paid transform quota — so a grid of three hundred originals is three hundred
multi-megabyte downloads with no server-side resizer in the loop to ask. The only place with the
pixels in hand is the browser that is already decoding the file to measure it, so it draws a 256 px
copy while it is there and PUTs it beside the original as a second object under the same id
(`avatar-<id>.<ext>` and `thumb-<id>.jpg`).

The original is still never re-encoded. A crop is a display transform, so a 4x zoom on a 768 px
source would show her face at 192 px of real detail, and the full-screen viewer serves the same blob.
This module *adds* a thumbnail; it does not touch what goes up.

Two details are load-bearing:

- **`bitmap.close()` in a `finally`.** The decode is deliberately full-size, because
  `createImageBitmap(file, { resizeWidth })` would lose the intrinsic `width`/`height` that
  `clampCrop` needs and `avatarRegisterSchema` bounds. An 8 MB 4032x3024 JPEG is ~48 MB of decoded
  surface, so a three-hundred-file folder that forgets to release them dies on the tab's memory
  ceiling. This is a memory ceiling, not tidiness.
- **The canvas is painted white before the draw.** A PNG with an alpha channel flattens to *black*
  behind a JPEG encoder, which on a portrait is a black halo around her hair. White and not `--card`,
  because this is baked pixel data and must not carry a theme.

Every failure returns `null` and is silent by design. `ExplorerPhoto.thumbUrl` is nullable precisely
so this can degrade instead of refusing an upload — and `null` is not an edge case, it is the
migration path: every row written before the column existed has no thumbnail, and a browser without
`OffscreenCanvas` uploads none.

### The panes

**`FolderTree`** — every row is a `<Link>`, which is the *inverse* of `usePanelParam`'s ruling, for
the reason given above. Expansion is **a default plus an override, never derived state**: a node is
open when it is on the path to the current folder (computed from props), and a chevron writes an
override for that one node. `override[path] ?? onPath.has(path)` is the whole rule, so there is no
effect copying props into state and no bug where the tree forgets where you are. The count column is
`totalCount` at every depth, right-aligned and `tabular-nums`: a collapsed folder reading "0" while
holding two hundred photos two levels down is the specific thing that makes a tree pane useless.

Three props are **required** and carry phase 6 through the recursion exactly as `hrefFor` already
was: `allFolders` (a flat `string[]` — the "Move to…" universe, deliberately not the
`{ folder, count }` rows `buildTree` reads), `onNavigate`, and `onFolderCreated`. `Row` also now
takes `path` and `totalCount` alongside what it prints: `label` is `'Album'` where `path` is `''`,
so the operations must be given the path; and the delete panel counts the **subtree** it is about to
remove, which is what `totalCount` is and what `ownCount` is not. They are the same number in `Row`
today and are passed separately so that stays true by construction.

**`PhotoGrid`** — the tile is a square `object-cover` crop with the filename under it, not a
`CircleFrame`. A file manager asks *"which file is this"* before *"what does she look like in it"*,
so `CircleFrame` moves to the selection pane where framing is actually being decided.
`photo.thumbUrl ?? photo.url` plus `loading="lazy"` is what makes 120 tiles a page survivable. A
plain `<img>`, per the repo's standing ruling on Blob-hosted photos. The pager says "121–240 of 314"
and offers Newer as well as Older; its one known cost is that a tile can repeat across two
consecutive pages *during* an upload, and nothing is ever skipped.

**`SelectionPane`** — the framing half is `AlbumManager`'s, moved and not rewritten: the same
`draft`/`stored`/`dirty` triple, the same `run()` transition helper, the same "Save framing" /
"Reset framing" pair through one action, the same two sanity circles at 44 px and 28 px. `CropStudio`
survived the move from a 460 px column into a 320 px rail without a line changing because it measures
its own frame with a `ResizeObserver`. What is new is two entries in the action list — "Set as her
profile picture", the primary action at the top, and `ShareToNinaItem` directly under it. There is
**no optimistic copy of the album**: every action calls `revalidatePath('/admin/nina')` and the page
is `force-dynamic`, so there is nothing here to keep in sync. `description` is shown as *"Can talk
about this photo"* / *"Cannot talk about this photo yet"* and never as prose.

**`UploadQueue`** — the sentence this component exists for is *"Nothing new. All 313 files are
already here."* "Upload only the new files" has a failure mode the requirement does not mention and
the operator hits on his second drop: **nothing happens**, which is indistinguishable from a broken
page. So `report.already` is on screen in words and numerals. One summary line by default; expanded,
every failure plus a bounded window of what is moving, and then an honest count of what it is not
drawing. `REFUSAL_TEXT` is an exhaustive `Record` over `UploadRefusal` rather than a `switch` with a
default, so adding a refusal reason in `lib/admin/filetree.ts` is a build error here until it has a
sentence.

### Folder maintenance — four verbs at the node, two at the selection

Phase 6 is R1's second half, *"easier to maintain"*, and it is two components rather than a screen:
`FolderMenu` on every tree row and `PhotoMoveBar` above the grid. Between them they hold six `run()`
calls, one `useTransition` each and not one rule.

**Every refusal belongs to the server.** Neither component pre-validates a name, pre-computes a
collision or greys out an illegal target. `lib/admin/folderOps.ts` — pure, and unit-tested in
`tests/admin.folderOps.test.ts` — decides all of it, and its sentences are what render in the error
line. One place a rule lives means no control that permits what the action refuses, or, worse,
forbids what it would have allowed. The only thing computed on the client is which destinations to
*offer*, and offering a bad one costs a refusal the operator can read.

That is also why **neither component imports `folderOps.ts`**. The path helpers `FolderMenu` needs —
`folderName`, `folderParent`, `isInFolderTree` — come from `lib/admin/filetree.ts`, which is
zero-import by design; `folderOps.ts` carries the operations' Zod schemas, and a module-level
`z.object(...)` is a side effect no bundler tree-shakes. Same rule as `NINA_ADMIN_BATCH_MAX`,
enforced at a new seam.

**`FolderMenu` — a `mode` union and four inline panels, no `<dialog>`.** `MemoryLedger`'s `FactRow`
is the precedent, taken verbatim: a `Mode` union
(`'idle' | 'menu' | 'create' | 'rename' | 'move' | 'delete'`), one panel per mode, one `run()` that
owns `pending`, the error line and the mode reset, and a Cancel that only sets `mode` back. A tree
row is the operator's *place* in a hundreds-deep album, and a modal is precisely the thing that
loses it.

The trigger is a `…` rendered inline in `FolderTree`'s `Row` — a 200 px flex line already holding a
chevron, a `<Link>` and a count — so **every panel is an `absolute` overlay** beneath it: `z-20`,
280 px wide, `shadow-sheet`. A panel laid out as a fourth flex *item* would squeeze the other three
and then wrap a text field into ~60 px. The overlay is a layout necessity of the seam phase 5 left,
not a second opinion about where the affordance goes.

Four verbs, and the root gets exactly one: **New subfolder** appears on every menu including the
album root's own `Row` — which is where a top-level folder is created — while Rename, Move to… and
Delete… are hidden when `folder === ''`. New subfolder living *inside* the per-folder menu is why
there is no "New folder" button under the `<nav>`, which is what phase 5's seam had sketched: the
parent is then the folder whose menu was opened rather than whichever folder the rail happens to have
selected, which is one fewer thing to check before clicking.

**"Move to…" is a named target list, and internal drag-to-move is deliberately not built.** Dragging
a folder onto another folder is the gesture a file manager suggests, and it would have to share
`dragover`/`drop` with phase 5's handler — the one that reads a folder dragged out of *Windows
Explorer* through `DataTransferItem.webkitGetAsEntry()`. One handler disambiguating an OS folder from
an in-page selection fails silently in both directions: a drop that should move 40 rows re-uploads 40
files, or a folder from the desktop is read as a move and uploads nothing. A `<select>` of paths
cannot be misread. Internal drag-to-move is a follow-up card, not a shortcut.

**`PhotoMoveBar` reads phase 5's selection and never writes it.** `selectedId` arrives as a prop,
`onDone` goes back out, and `if (count === 0) return null` — so the grid's layout does not shift on
an empty selection. Multi-select is **not built**: the bar takes today's single `selectedId` and
passes `[selectedId]`. The actions are already plural — `ids`, bounded by
`ADMIN_FOLDER_OP_MAX_IDS = 500` — so the day the grid grows a set, nothing on the server moves and
the copy already reads "N photos selected". Phase 5's selection model is the thing this phase
promised not to restructure, and a second writer of it is how the F17 double-upload happened.

**Moving photos is the sanctioned way to merge two folders.** A folder rename onto an occupied path
is refused outright, because a folder-column merge has no inverse — afterwards the rows are
indistinguishable. Moving the photos reaches the same end state reversibly: chosen per photo, in
front of the grid, with the ids still in hand. And a move of either kind is **one UPDATE of the
`folder` column** — no blob is copied, so moving four hundred photographs between folders moves zero
bytes. The `<select>`'s hint says exactly that, because a file manager that copies gigabytes on a
rename is the operator's reasonable fear.

**Her current photo is a refusal, not a greyed button.** It cannot be removed, and the server says so
before a row is touched: `currentPhotoRefusal` names the photo and both fixes. `keepCurrent` is the
operator's explicit second answer, and a delete taken that way leaves the folder holding exactly that
one photo and says so in `note`. The two components surface it differently, and the difference is
the interesting part:

- `PhotoMoveBar` takes `currentId` and uses it **for the warning only**. It can be honest there: if
  the current photo is on this page at all, it is in the grid the operator is looking at.
- `FolderMenu` takes **no `holdsCurrent` prop**, because nothing phase 5 passes could compute one.
  The grid is one page of one folder, so `photos.find((p) => p.isCurrent)` is `null` for almost every
  folder even when the flag should be true — and a `false` there would offer a delete the server
  refuses *and* hide the button that answers the refusal. Making it true would have meant a new
  current-photo read on `app/admin/nina/page.tsx` and a `currentFolder` prop threaded through two of
  phase 5's components, to duplicate a decision the server already makes. So the affordance is driven
  by the server's own answer: a refusal arriving while the delete panel is open sets `keepOffer`, and
  "Delete the rest, keep her photo" appears at the one moment it is the fix. One boolean instead of a
  read, a prop chain and a client-side guess.

`keepOffer` is read off `mode === 'delete'` and never off the message text, so no string matching
sits between a server sentence and a button.

**Deletes go rows first, blobs afterwards, and both panels say so** — *"a file left behind is
recoverable, a missing file under a live row is a broken picture in her album"*. The reap is best
effort in chunks of 100 and a failed chunk is logged rather than surfaced, which is the honest
description of what the operator is agreeing to.

One field on `AdminActionResult` is what keeps the explorer from stranding itself. `folder` is where
to look once the operation has landed — the folder just created, its new path after a rename or a
move, or a deleted folder's parent — because `?folder=` may name a folder that stopped existing the
instant the delete succeeded, so the action that changed the tree is the thing that knows where to
go. Every `onOk` in `FolderMenu` reads it, and a create additionally calls `onFolderCreated` so the
next drop lands in the folder that was just named. `note` carries the true-but-not-a-failure
sentence; `count` reports rows actually touched rather than rows asked for.

**Nothing here has been exercised against real rows.** Migration `0003` is applied to no live
database, so every folder operation is covered by typecheck, lint, build and
`tests/admin.folderOps.test.ts` and by nothing else.

### "Share link to Nina" — an ordering problem, not a UI problem

`ShareToNinaItem` renders one button. Everything difficult about it is **what happens in which order
inside a single click**, and all three rules exist because the obvious implementation is wrong.

- **The tab opens before anything is awaited.** `window.open` is granted on transient user
  activation, which Chrome expires roughly 5 s after the click. The describe behind this button is
  the `glm-4.6v` pre-pass — 8–11 s — so awaiting it first turns *"automatically open … in a new
  browser tab"* into a blocked-popup icon. The describe is **initiated** first and never awaited:
  `startTransition` runs its callback synchronously up to the first `await`, so the request is on
  the wire before `window.open` executes, and `window.open` is still inside the gesture.
- **The race that remains is honest.** `resolveAttachment` copies the description at *send* time,
  not at page load, so the describe has the new tab's whole load plus however long the operator
  takes to type — comfortably more than 11 s. If it loses, or z.ai is down, the send still works and
  she has nothing to say about the picture, which is what already happens for any un-described
  photo. Failures are `console.error`'d and never surfaced: the tab he asked for is already open,
  and the explorer's existing "Describe it" button is the retry.
- **`'noopener'` is not optional, and it is what makes it a tab.** Without it the new tab holds a
  live `window.opener` handle back onto `/admin/nina`, the app's only privileged screen, for no
  gain. Per the spec's `window.open` steps `noopener` is stripped from the feature string *before*
  the "is a popup requested" check, so the remaining feature map is empty and the result is a tab
  rather than a popup window. `window.open` with `'noopener'` returns `null` by specification, so
  the return value is not read and there is no popup-blocked branch — a blocked popup shows the
  browser's own indicator, which is better than anything this component could render.

Two props carry the judgements this component is not allowed to make. `described` is a **required
boolean, never the prose** — one bit is all the decision needs, and taking the bit keeps
`description` out of the component entirely (invariant 5); required, so a grid row that forgets to
carry it is a compile error rather than a silent vendor call on every share. `shareOrigin` is a
**required string from the server** for the reason under Gotchas below.

It calls `ensureNinaAvatarDescriptionAction` and not `describeNinaAvatarAction`: the latter
re-describes unconditionally (it is the album's retry button), while `ensure…` returns after one
indexed single-row read for any photo that already has a description. So the common case costs a
read, the `described` guard skips even that, and only a never-promoted never-shared photo pays the
8–11 s. It sends **nothing** — `attachNinaPhotoToChat` would send immediately and await the whole
13–16 s turn, which is the wrong order for R2's *"user can input additional text question / comment
(optional)"*. This component arms the composer; phase 3 owns everything that happens in the new tab.

The URL itself is not built here. `ninaPhotoShareUrl` lives in `lib/admin/shareToNina.ts` — a pure
function, and therefore testable, per the boundary rule this package is organised around.

## The framing studio

```ts
export function CropStudio(props: {
  src: string
  natural: { width: number | null; height: number | null }
  crop: NinaCrop
  onChange: (next: NinaCrop) => void
  disabled?: boolean
}): JSX.Element
```

Controlled, not stateful — the crop lives in `SelectionPane`, because "Save framing", "Reset framing"
and the dirty marker are all its business.

**This component contains no arithmetic beyond subtracting two pointer positions.** The clamping,
the aspect fit, the delta conversion and the CSS mapping are all `lib/nina/crop.ts` and are all unit
tested there. Invariant 6, with an exact precedent: `lib/photos/gallery.ts` was carved out of
`PhotoViewer.tsx` for the same reason.

Three non-obvious mechanics:

- **The wheel listener is registered by hand**, with `{ passive: false }`. React attaches `wheel` at
  the root as a *passive* listener, so `preventDefault()` inside an `onWheel` prop warns and the page
  scrolls anyway — which on this screen means the studio zooms *and* the page jumps.
- **`crop`, `natural` and `onChange` are mirrored into refs in an effect with no dependency array**,
  so the hand-registered listener never closes over a stale one. Written in an effect rather than
  during render because `react-hooks/refs` forbids the render-time write, and a wheel event can only
  arrive after the commit that ran it.
- **The zoom slider emits a factor, not an absolute scale** (`next / crop.scale`), so the frame
  centre holds still exactly as the wheel does.

Keyboard: arrows nudge, shift multiplies the step by five, `+`/`-` zoom. `touch-none` on the frame so
a touch drag pans instead of scrolling. Pinch-to-zoom is deliberately **not** implemented — the
screen is desktop-only, the slider covers every zoom a touch user needs, and this is named here
rather than left as an unexplained gap.

### `CircleFrame` — three stored numbers, correct at every size

```ts
export function CircleFrame(props: {
  src: string
  natural: { width: number | null; height: number | null }
  crop: NinaCropInput | null
  sizeClass?: string   // default 'size-24'. MUST be square.
  ring?: boolean       // default false — the accent ring the current photo wears
  className?: string
}): JSX.Element
```

The whole component is `ninaCropStyle(natural, resolveCrop(crop))` applied to an absolutely
positioned `<img>` inside an `overflow-hidden rounded-pill` box. The arithmetic is
`lib/nina/crop.ts`'s, and the mapping is worth stating because the admin preview and the chat header
must agree to the pixel:

```
span   = (naturalEdge · scale · 100) / min(width, height)     // % of the frame; cover at scale 1
left   = 50% + (crop.x / 10) − spanWidth / 2                  // offsets are thousandths of frame width
top    = 50% + (crop.y / 10) − spanHeight / 2
```

Two properties fall out of that. **Everything is a percentage of the frame, never a
`transform: translate()`** — a percentage translate would resolve against the *image's* own box, so
the same three numbers would mean different things at 28 px and 512 px. And **the box must be
square**: `top: N%` resolves against height while `left: N%` resolves against width, so a
non-square box would silently stretch the y offset. That invariant is the component's entire reason
to exist, which is why `sizeClass` is documented as square-only rather than validated.

`crop === null` is legal and renders as plain centred cover, because `resolveCrop(null)` is the
identity — and a partial triple, a `NaN`, or a sub-cover scale all fold into that identity rather
than throwing. `alt=""` always: the frame is decorative, never a caption.

`SelectionPane` draws it twice, at `size-11` and `size-7` — 44 px and 28 px, the chat header and the
typing row — so "it looked right in the tool" and "it looks right in chat" cannot diverge.

## `/admin/memory`

Three components, unchanged by the file-manager work and documented here because they are the rest of
the package. All three take their data as props from `app/admin/memory/page.tsx` and write through
`lib/admin/memoryActions`, whose every action returns the same envelope:

```ts
export interface AdminMemoryResult {
  ok: boolean
  error?: string
  canonical?: string   // what the row now says
  note?: string        // one sentence about what else was written
  id?: string
}
```

**`UserPicker`** — a wrapping row of plain `<Link>` pills, `aria-current="page"` on the selected one,
labelled `name ?? email ?? id` with a `slots · facts` count. It renders even for a single account, on
purpose: the page is per-user by contract and hiding the picker would make that invisible. Empty
accounts list returns one sentence and no `<nav>`.

**`MemoryLedger`** — insert, edit, retract, purge, over `FactCard[]`. The asymmetry between the four
is the design:

- **Retract is the primary action on every row.** It appends a record quoting the original verbatim
  and then deletes the original, so the wording survives while the wrong sentence stops reaching
  Nina.
- **Edit renders only when `fact.canEditInPlace`** (admin-authored rows). When it is false,
  `fact.editNote` renders as inline prose instead of a button.
- **Purge is `variant="ghost"`, last, and the only lossy operation.** It is gated on typing
  `ADMIN_PURGE_CONFIRMATION` exactly — `disabled={pending || confirm.trim() !== ADMIN_PURGE_CONFIRMATION}`.
- A retraction's replacement text is explicitly optional.

There are **no optimistic updates**: the actions call `revalidatePath('/admin/memory')` and the list
re-renders from the server. Each row waits for `ok` before collapsing its panel, and `Cancel` returns
to idle without clearing the typed draft.

**`MemorySlots`** — partitions `SlotCard[]` on `inVocabulary`, dispatches on `editKind`
(`'structured'` gets the read-only promises panel, everything else the editor), and lists orphaned
keys in their own section below.

Its one genuinely subtle mechanic is **derived state adjusted during render**:

```ts
const [lastValue, setLastValue] = useState(slot.value)
if (slot.value !== lastValue) {
  setLastValue(slot.value)
  setDraft(slot.value)
}
```

The server re-renders with the canonical value after every action, so the draft follows the prop
instead of diverging. Done during render rather than in an effect because an effect would paint the
stale draft for one frame and `react-hooks/set-state-in-effect` rejects it; remounting on a `key` was
rejected because it would discard the "saved as *canonical form*" note exactly when it matters.

Two further deliberate choices: there is **no "add a slot" form** — the vocabulary is closed, an
empty card already exists for every key, and typing into it *is* the insert path, so a free-text key
field would only manufacture the orphan rows the bottom section exists to clean up. And a refused
slot value offers **"Record it as a fact instead"** as a second click rather than silently degrading.

The promises panel is read-only text plus per-entry removal, which has to exist because the slot's
merge policy means nothing in the runtime can ever drop an entry. `removePendingPromiseAction`
deliberately writes no ledger row.

## Dependencies

### External

- `next/link`, `next/navigation` — `<Link>` for folder and page navigation; `useRouter().refresh()`
  once per finished gesture.
- `@vercel/blob/client` — `upload()`, which mints a token against
  `/api/admin/nina/upload` and PUTs directly to Blob.
- `react` — `useState`, `useEffect`, `useRef`, `useCallback`, `useMemo`, `useTransition`.

### Internal

- `@/lib/admin/filetree` — the folder-path grammar and the upload diff: `planFolderUpload`,
  `buildTree`, `folderAncestors`, `folderBreadcrumbs`, and the `LocalFileLike` / `UploadRefusal` /
  `FolderNode` / `PlannedUpload` types. **A zero-import module**, which is why a `'use client'` file
  may import it.
- `@/lib/admin/ninaAlbumActions` — every write: `registerNinaAvatarsAction`,
  `listNinaAlbumManifestAction`, `setCurrentNinaAvatarAction`, `saveNinaAvatarCropAction`,
  `describeNinaAvatarAction`, `ensureNinaAvatarDescriptionAction`, `deleteNinaAvatarAction`.
- `@/lib/admin/shareToNina` — `ninaPhotoShareUrl(origin, avatarId)`, the only writer of the
  `/nina?photo=avatar:<id>` link. **A near-zero-import module** (it pulls only `lib/nina/attach`'s
  `formatNinaPhotoParam` and `PHOTO_PARAM`), which is why a `'use client'` file may import it.
- `@/lib/admin/avatars` — `adminAvatarPathname`, `adminAvatarThumbPathname`, `extForContentType`,
  `ADMIN_AVATAR_MAX_UPLOAD_BYTES`, `ADMIN_AVATAR_MIN_EDGE_PX`.
- `@/lib/admin/schema` — `AvatarBatchRecord`, **as a type only**, so no validator crosses into the
  bundle.
- `@/lib/nina/crop` — the whole crop model: `NinaCrop`, `resolveCrop`, `isIdentityCrop`,
  `ninaCropStyle`, `panCrop`, `zoomCrop`, `nudgeCrop`, `zoomFactorForWheel`, and the scale bounds.
- `@/lib/nina/album` — `NINA_ADMIN_BATCH_MAX`.
- `@/lib/photos/resizeTarget` — `longEdgeTargetFor`.
- `@/lib/id` — `newId()`, which mints the id both blobs share.
- `@/lib/admin/memoryActions` — `/admin/memory`'s six writes: `insertFactAction`, `editFactAction`,
  `retractFactAction`, `purgeFactAction`, `saveSlotAction`, `recordSlotAsFactAction`,
  `retireSlotAction`, `removePendingPromiseAction`, and `AdminMemoryResult`.
- `@/lib/admin/memoryModel` — `FactCard`, `SlotCard`, `ADMIN_FACT_CATEGORIES`,
  `ADMIN_FACT_TEXT_MAX`, `ADMIN_SLOT_VALUE_MAX`, `ADMIN_PURGE_CONFIRMATION`.
- `@/lib/admin/users` — `AdminUserRow`, **as a type only**.
- `@/lib/db/schema` — `NinaPendingPromise`, **as a type only**, so no drizzle table module reaches
  the browser bundle.
- `@/components/ui` — `Button`, `ButtonLink`, `EmptyState`, `Card`, `Field`, `CONTROL_CLASS`, and
  `buttonClasses`, which is exported precisely so a non-`<button>` element — or, in
  `ShareToNinaItem`'s case, a plain `<button>` that must keep `onClick` directly on itself — can
  borrow the look without rendering `Button`.
- `@/lib/cn` — `cn()`.

**No runtime import in this directory reaches `zod`, `server-only`, or the database.** The two
`@/lib/db/schema` and `@/lib/admin/users` imports are `import type`, so they erase at compile time.
`NINA_ADMIN_BATCH_MAX` comes from `lib/nina/album.ts` rather than `lib/admin/schema.ts` specifically
because `schema.ts` would pull a validator into the `/admin` browser bundle for the sake of an
integer — a module-level `z.object(...)` is a side effect no bundler tree-shakes.

`lib/share/origin.ts` is the same shape of rule and the reason `shareOrigin` is a prop: it opens
with `import 'server-only'`, so nothing in this directory can call it and the answer has to arrive
from a Server Component. The share URL's *grammar* is importable because `lib/admin/shareToNina.ts`
was written to be — the origin is what cannot cross.

## Reverse Dependencies

### Primary consumers

- `app/admin/nina/page.tsx` — `FileExplorer`, plus `ExplorerFolder` and `ExplorerPhoto` as types. It
  gates with `requireAdmin()`, reads one folder and one page, maps `NinaAvatarRow` down to
  `ExplorerPhoto`, and hands the result over. It also calls `shareOrigin()` — the only place that
  can — and passes the string down as a prop. `announcedAt`, `pathname`, `sourceKey` and
  `thumbPathname` deliberately never cross the serialization boundary.
- `app/admin/memory/page.tsx` — `MemoryLedger`, `MemorySlots`, `UserPicker`.

### Secondary consumers

- `app/admin/layout.tsx` — `AdminNav`.

### Internal to the package

- `FileExplorer.tsx` re-exports `ExplorerFolder`, `ExplorerPageInfo` and `ExplorerPhoto` from
  `explorer/model.ts`, so a consumer needs one import path.
- `SelectionPane.tsx` is the only consumer of `CropStudio`, of `ShareToNinaItem` and — on this
  screen — of `CircleFrame`. `shareOrigin` is a pure pass-through in `FileExplorer`: it is read
  nowhere between `page.tsx` and `ShareToNinaItem`.

### Test consumers

None, and by design. vitest is `environment: 'node'` with no jsdom, so nothing in this directory is
reachable from a test; everything it *decides* was moved to `lib/` to be tested there. A new pure
judgement belongs in `lib/admin/filetree.ts` or `lib/nina/crop.ts`, not here.

`ShareToNinaItem` is the worked example. The component itself is untested and untestable — it is
`window.open`, `useTransition` and a click — but the one thing about it that can be *wrong on
paper*, the link's grammar, was put in `lib/admin/shareToNina.ts` and is covered by
`tests/admin.shareToNina.test.ts`, which round-trips the URL back through phase 3's
`parseNinaPhotoParam` rather than asserting literal bytes. That split is the rule, not a compromise.

## Data flow

```
app/admin/nina/page.tsx  (Server Component, force-dynamic, requireAdmin() on line 1)
  │  validateFolderPath(?folder)  ·  readPage(?page)  ·  two parallel reads
  │  shareOrigin()   ← server-only, resolved HERE, handed down as a string
  ▼
FileExplorer  ─── FolderTree ──────────► <Link href="?folder=…">  (server re-read)
      │      ─── PhotoGrid ───────────► <Link href="?page=…">     (server re-read)
      │      └── SelectionPane ───────► setCurrent / saveCrop / describe / delete
      │                    │                   └─► revalidatePath('/admin/nina')
      │                    └── ShareToNinaItem  (one click, in this order)
      │                            1. ensureNinaAvatarDescriptionAction  ← FIRED, never awaited
      │                            2. window.open(ninaPhotoShareUrl(origin, id), '_blank',
      │                                           'noopener')            ← inside the activation
      │                          the new tab: /nina?photo=avatar:<id>, phase 3 parses and arms
      │                          the composer; nothing is sent from here
      │
      │  drop ──► entriesFromDrop()   ← SYNCHRONOUS, before any await
      │  pick ──► filesFromPicker()
      ▼
useFolderUpload.run()
   walkEntries()            → WalkedFile[]
   listNinaAlbumManifestAction({ folder })   ← what is already here
   planFolderUpload({ base, files, manifest, maxBytes })   ← pure, tested in lib/
   setReport() / setItems()                                ← decide, THEN set
   runLanes(4):  measureAndThumbnail → PUT original → PUT thumb → record
   flush every NINA_ADMIN_BATCH_MAX: registerNinaAvatarsAction({ records })
   onFinished() → router.refresh()
```

## Concurrency

The upload queue is the only concurrent thing in this package, and it is cooperative rather than
threaded: `EXPLORER_UPLOAD_CONCURRENCY` lanes draw from one shared index in `runLanes`. `next++` is
atomic with respect to the other lanes because JavaScript is single-threaded and a lane only yields
at an `await`. `pending.splice(0, EXPLORER_REGISTER_CHUNK)` is likewise safe for two lanes reaching
`flush` — whichever arrives first has already emptied what it took.

Two refs, not state, guard the lifecycle:

- `busyRef` makes `run()` and `dismiss()` re-entrant-safe.
- `runRef` is a gesture counter. Every `patch` and every `set*` after an `await` checks it, so a
  promise belonging to a dismissed or superseded gesture cannot write into the live queue.

Everything else in the package is ordinary React: a `useTransition` per interactive pane
(`SelectionPane`, and one per row/editor in `MemoryLedger` and `MemorySlots`), and `CropStudio`'s
pointer capture keyed by `pointerId`. No component here spawns work that outlives it, and nothing
polls.

## Error handling

There are no error types here. Failures surface as strings a human reads, at the granularity the
human can act on:

- **Per file**, in `QueueItem.error` — "That file did not decode as an image.", "Too small to frame —
  the short edge is 180 px.", or the message the PUT threw. The lane continues.
- **Per gesture**, in `FolderUpload.error` — a failed manifest read, a drop with nothing readable, or
  the truncated-manifest warning ("some already-uploaded files may upload again"), which is honest
  and non-fatal: a truncated manifest makes the diff over-report, so files are re-PUT and their
  inserts are discarded by `ON CONFLICT DO NOTHING`. Slower, never wrong.
- **Per action**, in `SelectionPane`'s `error` state, rendered in a `role="alert"` paragraph.
- **Per memory action**, through `AdminMemoryResult`: `error` renders on the `Field` (which wires
  `aria-invalid` and `aria-describedby` through Field context) or as a red paragraph, and `note`
  renders in accent on success — the one sentence about what *else* the action wrote.

Two failures are deliberately silent, and both are logged rather than shown: thumbnail *derivation*
and thumbnail *upload*. Both leave `thumbUrl` null, which every consumer already handles, so neither
is allowed to fail an upload.

Nothing in this package throws on purpose and nothing panics the screen. The one refusal that cannot
be moved to `lib/` is the minimum-edge check in `uploadOne`, because only a decode knows the pixels.

## Performance

- **The grid never loads an original** when a thumbnail exists. That, plus `loading="lazy"` and a
  120-row page, is the whole answer to "hundreds of profile pics".
- **At most four decoded bitmaps are alive at once**, and each is `close()`d in a `finally`.
- **The register path is batched, the byte path is parallel** — parallel bytes, batched bookkeeping.
  Server Actions dispatch one at a time per client, so their latencies add rather than overlap; blob
  PUTs go through a Route Handler and genuinely overlap.
- **No vision call is on any path in this package.** The `glm-4.6v` describe (~8–11 s) was moved off
  the upload path entirely; it is scheduled by the promote action on `after()`. Three hundred awaited
  describes would have been 40 minutes to 1.4 hours of wall clock.
- `buildTree` and the on-path set in `FolderTree` are `useMemo`'d on `folders` and `current`.
- `UploadQueue` renders a summary plus at most `IN_FLIGHT_ROWS` moving rows; a three-hundred-row live
  list is a rendering cost paid for information nobody reads.

## Usage

### Mounting the explorer

```tsx
// In a Server Component, after requireAdmin().
<FileExplorer
  userId={userId}
  folders={folderList}   // ExplorerFolder[] — { folder, count }, one per non-empty folder
  photos={photos}        // ExplorerPhoto[]  — this folder, this page only
  page={{ folder, page, pageSize: NINA_ADMIN_PAGE_SIZE, total: listed.total }}
  shareOrigin={shareOrigin()}   // from lib/share/origin.ts — server-only, so it must be a prop
/>
```

`userId` is threaded from the session because blob pathnames interpolate it (invariant 3). It is
never read from a request. `shareOrigin` is threaded for the mirror-image reason: the module that
knows the answer cannot be imported by a Client Component, so the server resolves it once and hands
down the string.

### Gotchas

- **Do not make the `drop` handler `async`.** It is the single most common way this feature breaks,
  the failure is silent, and `dropWalk.ts`'s header exists to say so. Capture entries first,
  synchronously.
- **Do not `preventDefault()` the `wheel` event through an `onWheel` prop.** React's root listener is
  passive; the call warns and does nothing.
- **Do not `await` anything before `window.open` in `ShareToNinaItem`.** Same class of bug as the
  `async` drop handler and just as silent: user activation expires, the browser blocks the tab, and
  the requirement's *"automatically open"* becomes a popup icon. Fire the describe, then open.
- **Do not replace `window.open` with `<Link>` or `router.push`.** Both navigate *this* tab, which
  replaces the file manager the operator is mid-audit in. *"In a new browser tab"* is in the
  requirement.
- **Do not compute the share origin from `window.location.origin`.** It is the tempting inline fix
  and it is wrong: on a Vercel preview deployment it is a per-deployment hostname that dies at the
  next push, so the shared link would point at a URL that will not exist tomorrow. And a build-time
  public environment variable is forbidden outright (invariant 9). The prop is the only way.
- **Do not build the share URL with a template literal.** `/admin` writes the string and `/nina`
  parses it; a second place that knows the grammar is a place that can disagree about it.
  `ninaPhotoShareUrl` is the only writer, `formatNinaPhotoParam` the only formatter.
- **Do not call `readEntries()` once.** It returns at most 100 entries and ends with an empty array.
- **Do not add a decision to a `setState` updater.** Strict mode double-invokes it, and on this path
  that means two blobs for one file — F17 measured it.
- **Do not import `zod`, `server-only`, or anything database-shaped into this directory.** A
  constant needed on both sides belongs in a pure module (`lib/nina/album.ts`, `lib/admin/filetree.ts`);
  a type may be imported freely because it erases.
- **Do not render `description`.** Invariant 5. Show whether it exists.
- **Do not add a second upload path to this screen.** Two upload paths in one screen is exactly what
  `UploadAvatar.tsx` became and why it was deleted.
- **Do not put a new pure judgement here.** It cannot be tested in this directory. Put it in
  `lib/admin/filetree.ts` and import it.
- **`selectedId` is allowed to dangle.** Do not add an effect to reconcile it; the `find(...) ?? null`
  is the design.
- **The thumbnail upload's third argument is `'jpg'`.** The Route Handler cross-checks the pathname's
  extension against the declared content type and a mismatch is a 400.
- **Never give `CircleFrame` a non-square `sizeClass`.** It is not validated, it will not throw, and
  the failure is a silently stretched y offset — because `top: N%` resolves against height while
  `left: N%` resolves against width.
- **Do not "fix" `MemorySlots`'s render-time `setDraft` into an effect.** The render-phase adjustment
  is the correct React pattern here; an effect paints the stale draft for a frame and the lint rule
  rejects it. A `key`-based remount is also wrong — it discards the success note.
- **Do not add active-link highlighting to `AdminNav` or `UserPicker`.** `usePathname()` would turn a
  static nav into a Client Component to bold one word. `aria-current` already carries the state, to
  assistive tech as well as to the eye.

## Notes

Two components were retired when this screen landed, and neither should come back:
`AlbumManager.tsx` (superseded by `FileExplorer` plus the five `explorer/` modules; its framing half
was moved verbatim into `SelectionPane`) and `UploadAvatar.tsx` (superseded by the folder-aware
queue, which also retired the singular `registerNinaAvatarAction` in `lib/admin`).

Two seams were marked in the source for phases that follow. One is now closed:

- **Phase 6, folder maintenance** — still open. `FolderTree.tsx` carries the note. A "New folder"
  button belongs under its `<nav>` (it needs `current` as the parent), and rename / move / delete
  belong on `Row`, which is already the single place a folder is drawn.
- **Phase 7, "Share link to Nina"** — **closed**, and it cost exactly what the seam predicted: one
  entry in `SelectionPane`'s action list (`ShareToNinaItem`), one prop threaded
  `page.tsx -> FileExplorer -> SelectionPane -> ShareToNinaItem`, and nothing about selection
  restructured. `SelectionPane.tsx` still carries the `SEAM — PHASE 7` comment block immediately
  above the item it now renders; the paragraph explaining the leading-`*` comment style is still
  load-bearing and must stay, but the seam's own "phase 7 will need to…" prose now describes work
  that is done and reads as stale next to the `<ShareToNinaItem …>` three lines below it.

Known, accepted limitations: folder sort is lexicographic rather than natural; a tile can repeat
across two consecutive pages while an upload is in flight (nothing is ever skipped); empty
directories in a dropped tree are invisible to the browser and so cannot survive an upload; and
pinch-to-zoom is not implemented in `CropStudio`.

One note on the JSX comment style in `SelectionPane.tsx`: the leading `*` on every continuation line
is load-bearing. `ci:client-secret-guard`'s Rule 3 forbids a particular string anywhere in `app/`,
`lib/` or `components/`, and its comment exemption recognises `//`, `/*` and `*` — so a JSX comment
whose continuation lines are bare prose fails the guard while quoting the rule it is obeying.

## Documentation Created

2026-09-04 — initial creation via `/update-readme`, following task **P1-RI-A003**
(`admin-album-file-manager` phase 5, `/admin/nina` as a file manager). That task added
`FileExplorer.tsx` and the five `explorer/` modules — the folder tree, the folder-scoped paginated
grid, the drag-and-drop folder walk, the `webkitdirectory` picker, client-side thumbnail derivation,
the four-lane upload queue with chunked registration, the selection pane and "Set as profile
picture" — re-hosted `CropStudio` and `CircleFrame` unchanged, and deleted `AlbumManager.tsx` and
`UploadAvatar.tsx`.

2026-09-04 — updated following task **P1-RI-A005** (`admin-album-file-manager` phase 7 of 7,
requirement R2, "Share link to Nina"). It closed phase 5's `SEAM — PHASE 7`: added
`ShareToNinaItem.tsx`, threaded a `shareOrigin` string prop from `app/admin/nina/page.tsx` through
`FileExplorer` and `SelectionPane`, and left the URL grammar itself in the new pure
`lib/admin/shareToNina.ts` (`ninaPhotoShareUrl`) so it could be tested in Node. Nothing else in the
package changed shape.
