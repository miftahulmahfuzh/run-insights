# Package: components/admin

**Location**: `components/admin`
**Last Updated**: 2026-09-12 (compaction pass: every claim re-verified against the tree at
`7899385` — the `/admin/memory` section rewritten for the one-table rebuild, `TextModelSelect`
and the image-generation template/model controls documented for the first time, the
no-component-tests claim replaced with the colocated-suite reality, and the "migration not
applied" note replaced with a measured database state. Change log at the foot.)

## Overview

`components/admin` is the view layer of `/admin/**`: the Image collection — `/admin/nina`'s file
manager, her album as a folder tree and grid with the Media view (every photograph of the
conversation) behind the same chrome — plus the framing studio, `/admin/personality`'s two
controls, `/admin/image-generation`, `/admin/memory`'s one table, and `/admin/shortcuts`.
There is no data access, no validation and no vendor call in this directory. Reads arrive as
props from a Server Component; writes leave through a Server Action in `lib/admin`.

**The `'use client'` census is deliberate.** Most of the package is client, but `AdminNav`,
`UserPicker`, `CircleFrame`, `touch.ts` and `photoIcons.tsx` carry no directive. `CircleFrame`
is stateless with pure imports, so it renders on the server and compiles into whichever client
graph imports it. `UserPicker` expresses selection in the URL (`aria-current` + a `basePath`
prop) because `usePathname()` would make it client-rendered to bold one word. `AdminNav` is the
same arithmetic with one exception the owner ordered: the active phone-bar cell is painted
`text-accent` (`admin-bottom-bar-active-tab`), so the one subtree that reads the route — the
list — is `AdminNavLinks.tsx`, the shell's `'use client'` leaf, still server-rendered into the
initial HTML. `touch.ts` exports two class strings and nothing else; `photoIcons.tsx` is
`aria-hidden` inline-SVG decor whose accessible name lives on the control that draws it.

It is a **responsive surface with exactly one breakpoint, `lg` (64rem)**, a deliberate exception
to the rest of `components/`: the operator opens every one of these screens on an iPhone XS Max,
so below `lg` the explorer is one column with the folder rail behind a **Folders** drawer, tables
drop their read-only columns and scroll inside their own box, and the crop studio takes a pinch.
There **is** a bottom bar below `lg`, and it is `AdminNav` — not `components/ui/TabBar.tsx`
(the runner's five-tab bar inside `AppShell`'s 470 px column). No `AppShell` here; tokens are
borrowed from the app's design system, never re-invented.

**Anything a thumb hits is at least 44 px on its smaller axis**, spelled once in `touch.ts`:
`TOUCH_TARGET` (`min-h-11`) for a control that is already a block or flex line, `TOUCH_ICON`
for a glyph that needs a 44 × 44 box built around it. `Button` needs neither — `size="md"` IS
`h-11 px-4` — which is why the rails' icon buttons square themselves with `w-11 px-0`. When
something in here looks 20 px, that is the bug, not the density.

The organising rule is **invariant 6 as a boundary**: anything decidable is a pure function in
`lib/`. What is left here is what cannot be proved in Node — `DataTransferItem`,
`FileSystemDirectoryReader`, `OffscreenCanvas`, `ResizeObserver`, `PointerEvent`, `FileList` —
plus the JSX that arranges it. The judgement layer lives in `lib/admin/filetree.ts`,
`lib/admin/folderOps.ts`, `lib/admin/chatPhotos.ts`, `lib/nina/crop.ts` and friends, and is
unit-tested there. Testing has **two layers** since the component-test wave (2026-09-12):
pure decisions in `lib/` under the default `node` environment, and a colocated happy-dom suite
for essentially every component (`components/**/*.test.tsx` is in vitest's include; each file
opts in with a `// @vitest-environment happy-dom` pragma — 27 of them here). The third, oldest
layer reads a file in this directory **as text** to pin a property no runtime test can carry —
see Test consumers under Reverse Dependencies.

**Key Responsibilities:**

- Be `/admin/nina`'s file manager: folder tree, breadcrumb, folder-scoped paginated grid,
  drag-and-drop of nested folders, a directory picker, and a details rail; create, rename, move
  and delete folders from the row that names them, with every refusal left on the server.
- Serve the Media view — the conversation's photographs, her generated selfies and his composer
  uploads alike — with the full verb set: adopt as her profile picture under a draft framing,
  replace, remove, download, hand-edit or re-run the vision describe, read the generation
  prompt, and add new photographs on a carrier message.
- Turn a gesture into `WalkedFile[]` via the two non-standard browser APIs, derive a 256 px
  thumbnail in the browser, and run a bounded, resumable, chunk-registering upload queue.
- Own the framing studio and the sanity circles at the sizes chat actually draws; hand a photo
  to her chat as a pointer in a new tab with the describe fired but never awaited.
- `/admin/personality`: `CharacterPanel`'s whole-row auto-save tuning, and `TextModelSelect`
  for which GLM writes every text turn.
- `/admin/image-generation`: her standing photo prefs — dial, camera select, six emphasis
  checkboxes, four text fields, the editable prompt template, the photo-reference picker, and
  the paid test-prompt button.
- `/admin/memory`: one table over slots, pending promises and the fact ledger.
- `/admin/shortcuts`: the trigger registry as one optimistic-delete table.

## Module map

| File | Kind | Purpose |
|---|---|---|
| `touch.ts` | **no directive** | The 44 px rule spelled once: `TOUCH_TARGET`, `TOUCH_ICON`. Zero imports. |
| `FileExplorer.tsx` | `'use client'` | The `/admin/nina` screen. Layout, toolbar, breadcrumb, drop target, the two-arm URL grammar (`hrefForFolder` / `hrefForMediaView` / `hrefForPage`), the removal-`notice` line. Toolbar buttons are icon-only (private Lucide glyphs, `aria-label` is the name). Below `lg`: two-row toolbar, folder rail behind the `treeOpen` drawer (`id="admin-folder-rail"`). `?view=media` swaps the content pane to the Media view inside the same chrome; re-exports the `explorer/model.ts` types. |
| `explorer/model.ts` | **types only** | The Server→client props contract and the row union: `ExplorerPhoto` is `AlbumExplorerPhoto \| MediaExplorerPhoto`, discriminated by `origin`. The media arm types `thumbUrl` as the literal `null` (no thumbnail column) and `isCurrent` as `false` (adoption copies bytes into `nina_avatars`; the copy carries the flag). `QueueItem` / `QueueReport` — `report.already` is the number the upload exists to show. No runtime export. |
| `explorer/dropWalk.ts` | browser APIs | `webkitGetAsEntry()` capture, the `readEntries` pump (`EXPLORER_WALK_MAX_FILES = 2000`, `EXPLORER_WALK_MAX_DEPTH = 12`), the `webkitdirectory` picker. Decides nothing. |
| `explorer/thumbnail.ts` | browser APIs | One decode: intrinsic size out, `EXPLORER_THUMB_SHORT_EDGE_PX = 256` JPEG (`EXPLORER_THUMB_QUALITY = 0.82`) out. |
| `explorer/useFolderUpload.ts` | `'use client'` hook | One gesture end to end: walk, manifest, diff (`planFolderUpload`), four-lane upload, chunked register. |
| `explorer/FolderTree.tsx` | `'use client'` | The folder rail. Every row is a `<Link>` and 44 px, expansion is `override[path] ?? onPath.has(path)`, the count column is subtree `totalCount`. Carries the pinned Media row (`mediaViewNode` — a view, not a `FolderNode`; badge `mediaCount` on both views) and one `FolderMenu` per `Row`. |
| `explorer/PhotoGrid.tsx` | `'use client'` | One page of square tiles + the "121–240 of 314" pager. `thumbUrl ?? url` + `loading="lazy"`; view-aware in exactly three copy places. |
| `explorer/SelectionPane.tsx` | `'use client'` | The details rail, as a two-line dispatcher on `isMediaRow`: album rows render the private `AlbumSelectionPane` (framing, facts, one icon row, `PhotoDescription` with the album closures), media rows render `MediaPane`. Neither arm reads the `origin` discriminant below the dispatch. |
| `explorer/MediaPane.tsx` | `'use client'` | One Media row in full — the purged `/admin/photos` rail re-hosted in the album pane's idiom. Adoption DRAFT framing (the `worn` latch), the prompt brush INSIDE the `photo.prompt != null` conditional (no dim state), `MediaControls` in the icon row, `PhotoDescription` with the media closures, keyed by `photo.id` so remount is the reset. |
| `explorer/MediaAdd.tsx` | `'use client'` | The Media toolbar's "Add photos": encode → dedupe pre-check → PUT → `addChatPhotoAction` on a carrier message. Sequential `for` loop, per-file failure is not batch failure, no confirmation. |
| `explorer/MediaControls.tsx` | `'use client'` | Replace and Remove for one media row, as a fragment in `MediaPane`'s icon row. No confirmation; a remove's `note` goes UP to `FileExplorer` via `onRemoved` because this pane unmounts under the revalidation that carries it. |
| `explorer/PhotoDescription.tsx` | `'use client'` | THE one describe control, mounted by BOTH arms. Stored prose editable by hand (SAVE button, not blur), a describe/re-describe button always available that runs the vision model and OVERWRITES. Imports no server action — the host hands in `onSave` / `onRedescribe` closures. |
| `explorer/chatPhotoUpload.ts` | `'use client'` | The encode both media flows share: decode once, `ADMIN_CHAT_PHOTO_LONG_EDGE_PX = 1024` on the long edge (`NINA_IMAGE_HEIGHT`), `ADMIN_CHAT_PHOTO_QUALITY = 0.9`, hash the ENCODED blob before the PUT. `opts.dedupe` is opt-in and Add is its only caller. |
| `explorer/UploadQueue.tsx` | `'use client'` | The upload's one honest sentence — "Nothing new. All 313 files are already here." `REFUSAL_TEXT` is an exhaustive `Record` over `UploadRefusal`, so a new refusal reason is a build error here until it has words. |
| `FolderMenu.tsx` | `'use client'` | One folder's four verbs (New subfolder / Rename / Move to… / Delete) as a `Mode` union with four `absolute` overlay panels (`z-40` — it must clear `AdminNav`'s `z-30` bottom bar). Decides nothing; refusals render `lib/admin/folderOps.ts`'s own sentences. |
| `PhotoMoveBar.tsx` | `'use client'` | Move or remove the selection; reads `selectedId`, never writes it; `null` when nothing is selected. Album arm only. |
| `ShareToNinaItem.tsx` | `'use client'` | "Share link to Nina". Fires the describe, opens the tab inside the click's activation, awaits neither. |
| `CropStudio.tsx` | `'use client'` | Drag / pinch / wheel / slider / arrows. Every pointer tracked by `pointerId` in a Map: one pans, two pinch. Contains one subtraction and one `Math.hypot`. |
| `CircleFrame.tsx` | **no directive** | A stored crop as a circle at any size. `ninaCropStyle` + a square box; percentages, never `translate()`. |
| `photoIcons.tsx` | **no directive** | The shared inline-SVG glyph set — one home so one trash cannot grow two silhouettes. `EyeIcon` is exported with no consumer today (its toggle left with R3). |
| `AdminNav.tsx` | **no directive** | The nav shell: `<nav>`, desktop eyebrow/footer, breakpoint mechanics (`fixed bottom-0` + `pb-[calc(var(--safe-bottom)/2)]` below `lg`, `lg:sticky lg:top-8` above). The list is `AdminNavLinks`. |
| `AdminNavLinks.tsx` | `'use client'` | The nav's LIST, both renditions from one markup: below `lg`, `grid h-14 max-w-[470px] grid-cols-6 px-[7px]` — six cells, each a 24 px inlined Lucide glyph named by its sr-only `short` (Overview · Photos · Persona · Images · Memory · Shortcut); at `lg`, the sticky text rail. `usePathname()` paints the active glyph `text-accent` + `aria-current="page"`; at `lg` the active cell fills the `bg-accent-soft` pill with explicit `lg:hover:` twins. `/admin/nina`'s label is **"Image collection"** (short "Photos") since the p4 rename. |
| `ShortcutTable.tsx` | `'use client'` | `/admin/shortcuts` — `MemoryTable`'s mechanics with different columns; on/off checkbox leads the row; only the delete is optimistic. |
| `ImageGenPanel.tsx` | `'use client'` | `/admin/image-generation` in full: the prompt-length `DialSlider`, the image-model select, six focus checkboxes, four text fields with ✕ clears, the photo-reference picker, and the editable prompt template with its placeholder legend. `CharacterPanel`'s auto-save pipeline over `lib/admin/imageGenModel` (debounce `IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS = 600`); one `useTransition`, one whole-row action. |
| `ImageGenTestPanel.tsx` | `'use client'` | The paid test button and its verdict. Opens a job off the SAVED prefs, returns, then polls on an escalating schedule bounded by `NINA_IMAGE_TEST_GIVE_UP_MS = 480_000`, the terminal verdict, and unmount. Verdict lines live in `lib/admin/imageGenTestView.ts`, never here. Reads the quota itself; takes `dirty` to warn that the test reads saved settings. |
| `PhotoReferencePicker.tsx` | `'use client'` | The reference grid: album + chat photographs as one caption-less, gapless, square-tile wall. `items` / `total` / `value` / `onChange`; single selection, reveal-by-`PHOTO_REFERENCE_REVEAL_STEP = 48`, `loading="lazy"`. |
| `photoReferenceModel.ts` | **no directive** | The picker's view model: `PhotoReferenceItem` pinned at exactly three fields — which is what makes "no captions, no dates" structural. |
| `UserPicker.tsx` | **no directive** | Whose rows are being edited. Plain links, `aria-current`, selection in the URL; `basePath` defaults to `/admin/memory`. |
| `CharacterPanel.tsx` | `'use client'` | `/admin/personality`'s tuning — twelve trait sliders, the relationship selector, four extra dials, notes, the assembled prompt preview. Auto-saves through `saveNinaTuningAction` (dials debounced 600 ms, toggles/radios on change, notes on blur); no Save/Discard/Reset row. `id="character"` kept on the section root. |
| `DialSlider.tsx` | `'use client'` | The range primitive `components/ui` does not have. Label, hint, value, unsaved dot, `defaultValue` chip (the only route back to a single default), optional per-dial on/off checkbox (`enabled` + `onEnabledChange`). Shared by `CharacterPanel` and `ImageGenPanel`. |
| `MemoryTable.tsx` | `'use client'` | `/admin/memory` in full (R1: *"just make all the memory to show as one simple table"*). ONE table, three `<tbody>` groups — Slots, Pending promises, Ledger — five columns (`What · Value · Origin · When · ✕`, Origin/When `hidden lg:table-cell`), blur-to-save cells whose drafts follow their props during render, optimistic DELETE only (a deleted slot reappears as its BLANK row), and the add row at the top of the ledger group. Replaced the deleted `MemoryLedger`/`MemorySlots` cards. |
| `TextModelSelect.tsx` | `'use client'` | Which GLM writes every text turn — a single `select` beside `CharacterPanel` on `/admin/personality`, optimistic with revert-on-failure, saving through its own one-export action. Deliberately NOT a control on the panel: a different row, store and blast radius. |

## The `/admin/nina` file manager

### Layout: three columns at `lg`, one column and a drawer below

At `lg`: a 200 px folder rail, a `minmax(0,1fr)` canvas, a 320 px details rail when open. Below
`lg` those stack in DOM order and the rail becomes a **drawer**: `FileExplorer` holds `treeOpen`,
the toolbar grows an icon-only `lg:hidden` button (`aria-controls="admin-folder-rail"`), and the
rail stays in the DOM at every width (`hidden lg:block`) so expansion overrides and an open
`FolderMenu` survive a toggle. The drawer is closed by default (the breadcrumb already answers
"where am I"), and it is `lg:` **classes rather than a `matchMedia` hook** — no breakpoint to
observe, no first frame missing a column. The toolbar is two rows below `lg` and one flex line
at `lg` via `lg:contents` on the control group.

### What lives in the URL and what lives in state

- **`?folder=`, `?page=` and `?view=` are in the URL** because they decide *which rows exist*:
  the page re-runs its list query for them. `app/admin/nina/page.tsx` parses `?view=` once with
  `readExplorerView` (`lib/admin/filetree.ts`) and hands `view` down as a prop; anything that is
  not `media` reads as the album, so a stale bookmark degrades instead of erroring. Folder clicks
  are real `<Link>` navigations — deep-linkable, back-button-able.
- **The selected photo is `useState`** — putting it in the URL would re-run a Server Component
  that just did two database reads, on every click, for state that never leaves the client. The
  consequence is by design: `selectedId` may name a photo no longer on the page, and
  `photos.find(...) ?? null` is the entire handling — the pane closes itself. No effect.
- **`pendingFolders` is a one-render bridge, not storage.** A created folder is durable in
  `nina_folders`; this state only covers the window before the server's list includes it, and the
  merge into `allFolders` is a **filter, not a union**, so the pending copy dies the moment the
  server knows the folder.

The URL grammar has one home in `FileExplorer.tsx` and is a two-arm family: `hrefForFolder`
spells `?folder=&page=`, `hrefForMediaView` spells `?view=media&page=N` (name and value from
`lib/admin/filetree.ts` — writer and reader cannot disagree), and `hrefForPage` branches on the
view so media page 2 cannot drop the operator into the album. Root folder is the **absence** of
`?folder=`, page 1 the **absence** of `?page=`. There are two ways out of the grammar, not two
spellings: `hrefFor` *builds* (for `<Link>`), `navigateToFolder` *goes* (`router.push`) for
folder operations that only learn their destination from the server's answer.

### The two gestures produce one shape

```ts
export interface WalkedFile extends LocalFileLike {
  relativePath: string   // 'bali/day-2/DSC_0031.jpg' — not normalised, not prefixed
  file: File
}
```

A picker gives `webkitRelativePath` for free; a drop gives nothing until the entry tree is walked
by hand. Both end as `WalkedFile[]`, so the diff, queue and progress bar have one implementation.
Because `WalkedFile extends LocalFileLike`, it feeds `planFolderUpload` with no adapter, and
`PlannedUpload.source` hands the caller's own `File` back — which is why `useFolderUpload` keeps
no `sourceKey -> File` map.

### Three browser-API hazards, each handled in one named place

1. **`entriesFromDrop` must be called synchronously.** A `DataTransferItemList` is only valid
   during its own event's dispatch; await anything first and `webkitGetAsEntry()` returns `null`
   for every item — a silent empty drop. The entries stay valid; only the item list does not.
   So the capture is sync, `walkEntries` is not, and `FileExplorer`'s `onDrop` is deliberately
   not `async`.
2. **`readEntries()` returns at most 100 entries and ends with an empty array.** The one-liner
   truncates every folder to 100 files with no error. `readAllEntries` pumps the *same* reader
   (a reader is a cursor; a fresh one starts over) until the empty batch.
3. **`webkitdirectory` cannot be a JSX prop.** React's `InputHTMLAttributes` lacks it; the DOM
   property is real and typed, so an effect sets it on the ref after mount. Without that line
   there is no directory picker at all.

The walk's ceilings (`2000` files, depth `12`) and its per-file skip-with-a-warning are
deliberate: a file below the album's own folder bound is refused by `planFolderUpload` with a
readable reason, whereas a walk that stops early just makes files vanish; one unreadable file
(OneDrive placeholder, lock) must not abort a three-hundred-file folder.

### The upload queue

```ts
export const EXPLORER_UPLOAD_CONCURRENCY = 4
export const EXPLORER_REGISTER_CHUNK = NINA_ADMIN_BATCH_MAX
// FolderUpload: phase idle|reading|planning|uploading|finished, items, report, error,
// start(walked), startWalk(entries), dismiss()
```

- **Decide, set, run — nothing inside a `setState` updater.** Strict mode double-invokes
  updaters, and on this path that minted **two** upload tokens and wrote **two** blobs (F17,
  measured). `run()` gathers, awaits the manifest, calls the pure planner, sets values, then
  starts effects.
- **Bounded concurrency, not `Promise.all`.** Four lanes saturate a home upstream, keep at most
  four decoded bitmaps alive, and make progress legible. `runLanes` is four lines: `next++`
  needs no lock because each lane only advances at an `await`.
- **Registering in chunks as files land.** Records flush every `NINA_ADMIN_BATCH_MAX`
  completions, so a tab closed at 290 of 300 leaves 250 registered rows instead of 300 orphaned
  blobs. The register action is idempotent on the dedupe key's unique index — a re-drop after a
  crash re-registers nothing.
- **The manifest is read for the destination subtree, not the whole album** — the dedupe key
  folds in the path, so the same file in two folders is two files, on purpose.
- **The orphan exposure is named, not hidden**: an upload dying between PUT and register chunk
  leaves a blob no row points at, which is why `dismiss()` refuses to run while the queue is
  busy. A `runRef` gesture counter guards every post-`await` state write.

### The derived thumbnail

`next/image` is ruled out for Blob-hosted photos repo-wide (paid transform quota), so the browser
already decoding the file to measure it draws a 256 px JPEG copy and PUTs it beside the original
(`avatar-<id>.<ext>` and `thumb-<id>.jpg`). The original is never re-encoded — a crop is a
display transform. Two load-bearing details: **`bitmap.close()` in a `finally`** (the decode is
full-size because `clampCrop` and `avatarRegisterSchema` need intrinsic dimensions; an 8 MB
4032×3024 frame is ~48 MB of decoded surface, and this is a memory ceiling, not tidiness), and
**the canvas is painted white before the draw** (a PNG's alpha flattens to a black halo behind a
JPEG encoder; white, not `--card`, because this is baked pixel data). Every failure returns
`null` silently: `thumbUrl` is nullable so this degrades instead of refusing an upload, and
`null` is the migration path for every pre-column row.

### The panes

**`FolderTree`** — every row is a `<Link>` (the inverse of `usePanelParam`'s ruling, for the
URL-vs-state reason above). Expansion is **a default plus an override, never derived state**:
`override[path] ?? onPath.has(path)` is the whole rule. The count column is subtree
`totalCount` at every depth — a collapsed folder reading "0" while holding two hundred photos
two levels down is what makes a tree pane useless. The pinned **Media** row is
`mediaViewNode(count)` and deliberately not a `FolderNode`: everything a path enables is exactly
what a view must not have, so the node carries a `view: 'media'` discriminant, no children and
no `…` menu. Its badge is the whole-collection `mediaCount` on BOTH views, and it is active on
`view === 'media'` — the `view` half is load-bearing because Media and the album root share the
path value `''`. Three props thread phase 6 through the recursion: `allFolders` (the flat
"Move to…" universe), `onNavigate`, `onFolderCreated`; `Row` takes `path` and `totalCount`
alongside `label` because the delete panel counts the subtree.

**`PhotoGrid`** — a square `object-cover` tile with the filename under it, not a `CircleFrame`
(a file manager answers "which file is this" first); `photo.thumbUrl ?? photo.url` plus
`loading="lazy"` is what makes 120 tiles survivable. Plain `<img>`, per the standing ruling.
The pager offers Newer and Older; its one known cost is a tile repeating across two consecutive
pages *during* an upload — nothing is ever skipped. View-awareness is exactly three copy changes
plus `hrefForPage`'s branch. On the media arm `thumbUrl ?? url` is not a fallback but the only
path (`thumbUrl` typed `null` permanently), which is why that arm runs
`NINA_CHAT_PHOTO_PAGE_SIZE = 48` a page instead of 120.

**`SelectionPane` / `AlbumSelectionPane`** — the framing half is `AlbumManager`'s, moved, not
rewritten: the `draft`/`stored`/`dirty` triple, one `run()` helper, "Save framing" /
"Reset framing" through one action, the two sanity circles at `size-11`/`size-7` (44 px and
28 px — the chat header and the typing row). `CropStudio` survived the move into a 320 px rail
because it measures its own frame with a `ResizeObserver`. The rail scrolls itself into view on
selection change with `block: 'nearest'` — unconditional and safe, because `nearest` on an
already-visible element scrolls nothing. The action surface is ONE `flex-wrap` icon row
(2026-09-10, *"kalau tombol tombolnya bisa dijejerin dalam satu row, maka jejerkan mereka dalam
satu row saja"*): framing's two verbs, a hairline, then Set as her profile picture,
`ShareToNinaItem`, the download (on `useSavePhoto`'s shared ladder, warmed on `pointerdown` —
not a third save implementation), Remove last. There is **no optimistic copy of the album**:
every action calls `revalidatePath('/admin/nina')` and the page is `force-dynamic`. The describe
verb lives in the `PhotoDescription` section below the row, next to the prose it rewrites.

**`UploadQueue`** — "Upload only the new files" has a failure mode the requirement does not
mention: the operator's second drop does *nothing*, which is indistinguishable from a broken
page. So `report.already` is on screen in words and numerals. `REFUSAL_TEXT` is an exhaustive
`Record` over `UploadRefusal` rather than a `switch` with a default, so a new refusal reason in
`lib/admin/filetree.ts` is a build error here until it has a sentence.

### The Media view — the conversation's photographs, same chrome

`?view=media` exists because the standalone `/admin/photos` surface did: one collection
maintained from a second route with a second grid and a second verb set, so the merge (task
`P1-RI-A035`) deleted that surface — eight files and its route — and re-hosted it here. **The
same chrome over a different table**: tree, breadcrumb, pager and rail stay put; rows come from
`nina_message_images` (`listNinaMediaPhotos`, originals — her `'generated'` worker output and
his `'upload'` composer attachments alike). The album's verbs stand down on this arm: no drop
handlers (a drag is absorbed only far enough to stop the browser navigating away), `MediaAdd`
replaces the album Add buttons, `PhotoMoveBar` does not render, `UploadQueue` stays mounted and
idle (it is a hook, so it cannot be conditional). The breadcrumb grows a second crumb appended
in the JSX rather than faked into `folderBreadcrumbs`' shape — a fake path in the type would be
a lie the breadcrumb then had to special-case. A folder operation fired while Media is open
lands on the folder's ALBUM view, the only place its rows can be drawn.

**`MediaPane`** — one media row in full, in the album pane's idiom. Four things make it its own
component rather than a branch inside the album pane:

- **Framing is adoption, and the draft has nowhere to persist.** `nina_message_images` has no
  crop columns, so `CropStudio` + the two circles render a DRAFT that starts at identity and
  resets with the selection; its ONE consumer is `setChatPhotoAsAvatarAction`, which receives
  `scale`/`x`/`y` at click time and copies the bytes into a fresh `avatar-` object. The `worn`
  latch disables the button once the action answered `ok`.
- **The prompt affordance exists only while the sidecar does.** The old rail's brush always
  rendered and dimmed on `prompt == null` — the defect the owner named. Here the toggle is
  INSIDE the `photo.prompt != null` conditional: a replaced row (the update nulls `prompt` in
  the same statement as the bytes) and a hand-added row show no prompt affordance at all. The
  column's NULL is the state; `tests/admin.mediaPane.test.ts` reads the source to keep it that
  way.
- **Orphans are first-class members.** `messageId` is nullable with `ON DELETE SET NULL`, so a
  deleted session orphaned its photographs instead of destroying them; an orphan has no carrier
  to remove and nothing here treats it as broken. It is displayed nowhere.
- **No filename is invented.** The grid tile derives a display name from date + id; the pane
  prints the timestamp. The stored `pathname` is displayed nowhere and parsed nowhere.

**`MediaControls`** — Replace and Remove, no confirmation, by the owner's own ruling (*"i am the
only one using this app, no need for all these bullshit confirmation"*). Remove calls the action
on click; Replace uploads on `change`; `busy` exists only to stop a double-click firing two
uploads, which is a different thing from a confirmation. The removal `note` goes UP via
`onRemoved(note)`: a photograph whose bytes are still referenced elsewhere keeps them, and the
action says so — but this pane unmounts the instant the revalidation arrives without the removed
row, so `FileExplorer` (which does not unmount) renders the note under the toolbar until the
next removal replaces it.

**`PhotoDescription`** — R3's whole point: ONE describe control for every photograph on the
page, and the host arm picks the actions. It **imports no server action**: `onSave` and
`onRedescribe` arrive as closures from `AlbumSelectionPane`
(`editNinaAvatarDescriptionAction` / `describeNinaAvatarAction`) or `MediaPane`
(`editChatPhotoDescriptionAction` / `describeChatPhotoAction`), so a rename in either action
family fails at the call site in that arm instead of silently inside a component that guessed.

- **The prose edit is a SAVE button, not commit-on-blur.** The no-confirmation ruling is about a
  SECOND click; this is the FIRST click of the write, and a stray blur must not store a
  half-finished sentence into her prompt. An emptied box is a CLEAR — the button's accessible
  name flips so the write names itself.
- **The describe button is ALWAYS rendered** — the null guard the panes used to add was the
  defect R3 exists to remove (a described photo with wrong prose had no way to re-run the eyes).
  It OVERWRITES machine- or hand-written prose; there is no confirmation, because the hand-edit
  box above is the correction path.
- **`draft === null` means untouched, which is why there is no effect.** The box shows the
  server's prose until he types, and once he has typed, nothing from the server overwrites him —
  which is what makes a re-describe safe under unsaved text. After a SAVE the draft drops to
  `null`; after a DESCRIBE it is deliberately left alone.
- **One flight at a time.** A save and a describe running concurrently would interleave two
  writes to one column with no meaning attached to the winner. The textarea is disabled during a
  SAVE (the value being written must not change under the write) and left ENABLED during a
  DESCRIBE — an 8–11 s vendor call must not lock him out of typing.
- **`emptyNote` is worded by the host** — the album arm says the prose fills in once the photo is
  hers; the media arm says reload in a moment, because after an Add/Replace the field is NULL
  for the seconds the `after()` caption pass takes.

The describe subject follows the photo: `describeChatPhotoAction` picks through
`describeSubjectForSide` (`lib/nina/album.ts`) — hers gets the self prompt, his the runner
prompt — so neither arm ever points the runner prompt at her face. The keyed remount per
selection resets the draft, which keeps one tile's unsaved text out of the next tile's box.

**`MediaAdd`** — every row hangs off a carrier message `addChatPhotoAction` mints, because "add
a photo" is still "add a message with a photo on it"; a NULL `message_id` is the residue of a
DELETE, never something a writer asks for. The multi-file pick is a sequential `for` loop
(Server Actions dispatch one at a time per client); the loading dots are the whole progress
display; a per-file failure is recorded and the loop continues.

**`explorer/chatPhotoUpload.ts`** — the encode both flows share: decode once, 1024 px long edge
(`NINA_IMAGE_HEIGHT`, so a hand-added photograph lands in the same size class as a generated
one), JPEG 0.90 (higher than the runner composer's 0.75 — this is a photograph he chose and will
look at full-screen), `bitmap.close()` in a `finally`, white canvas. The pathname is bound here
(`adminChatPhotoPathname`, the only producer of the shape) and parsed nowhere. The dedupe hash
is over the ENCODED blob before the PUT — the exact bytes the object will hold — with the picked
file's hash as the second key for a re-uploaded download whose re-encode nobody has stored.
**Dedupe is opt-in and Add is its only caller**: Replace's contract is "swap the bytes behind
THIS row", and a deduped replace would point the row at another row's object and strip its
provenance to a reference — which the collection reads then hide, making a visible photograph
vanish.

**No thumbnails on the media arm, on purpose**: no thumbnail column, `thumbUrl` typed `null`
permanently, originals at 48 a page with `loading="lazy"` carrying what it can.

### Folder maintenance — four verbs at the node, two at the selection

`FolderMenu` and `PhotoMoveBar` hold six `run()` calls, one `useTransition` each, and not one
rule. **Every refusal belongs to the server**: neither component pre-validates a name,
pre-computes a collision or greys out a target — `lib/admin/folderOps.ts` (pure, unit-tested)
decides all of it and its sentences are what render. One place a rule lives means no control
that permits what the action refuses. Which destinations to *offer* is the only client-side
judgement, and offering a bad one costs a refusal he can read.

That is also why **neither component imports `folderOps.ts`**: it carries the operations' Zod
schemas, and a module-level `z.object(...)` is a side effect no bundler tree-shakes. The path
helpers `FolderMenu` needs — `folderName`, `folderParent`, `isInFolderTree` — come from
`lib/admin/filetree.ts`, which is zero-import. Same rule as `NINA_ADMIN_BATCH_MAX`, one seam
later.

**`FolderMenu`** is `MemoryTable`'s predecessor idiom taken verbatim: a `Mode` union
(`'idle' | 'menu' | 'create' | 'rename' | 'move' | 'delete'`), one panel per mode, one `run()`
owning `pending`/error/mode reset, and a Cancel that only sets `mode` back — a tree row is the
operator's *place* in a hundreds-deep album, and a modal is what loses it. The panels are
`absolute` overlays (`z-40`, 280 px capped at `calc(100vw-2rem)`), not a fourth flex item — a
panel laid out inside the 200 px `Row` would wrap its text field into ~60 px. **The `z-40` is
not decorative**: below `lg` the shell's `AdminNav` is `fixed bottom-0` at `z-30`, and at `z-20`
the Delete and Move rows of a last-row panel painted underneath the bar and could not be tapped.
Four verbs; the root gets exactly one — New subfolder appears on every menu including the root's
own `Row`, which is where a top-level folder is created (and why there is no "New folder" button
under the `<nav>`: the parent is then the folder whose menu was opened, one fewer thing to check
before clicking).

**"Move to…" is a named target list, and internal drag-to-move is deliberately not built.** A
drag would have to share `dragover`/`drop` with the OS-folder walker, and one handler
disambiguating an OS folder from an in-page selection fails silently in both directions (a move
re-uploads 40 files, or a desktop folder uploads nothing). A `<select>` of paths cannot be
misread.

**`PhotoMoveBar`** reads phase 5's selection and never writes it, renders on the album arm only
(a media row's Remove is carrier-aware and lives in `MediaPane`), and `if (count === 0) return
null` so the grid does not shift. Multi-select is not built: it wraps the single `selectedId`
in an array, and the actions are already plural (`ids`, bounded by `ADMIN_FOLDER_OP_MAX_IDS =
500`) — so the day the grid grows a set, nothing on the server moves.

**Moving photos is the sanctioned way to merge two folders.** A rename onto an occupied path is
refused outright (a folder-column merge has no inverse); moving photos reaches the same end
state reversibly. A move of either kind is one UPDATE of the `folder` column — moving four
hundred photographs moves zero bytes, and the `<select>`'s hint says so.

**Her current photo is a refusal, not a greyed button.** It cannot be removed, and the server
says so before a row is touched, naming the photo and both fixes. The two components surface it
differently, and the difference is the point: `PhotoMoveBar` takes `currentId` and uses it for
the warning only (honest there — if the current photo is on this page it is in the grid he is
looking at). `FolderMenu` takes **no `holdsCurrent` prop**, because nothing its caller could
pass computes one: the grid is one page of one folder, so a client-side guess would be `false`
almost everywhere — offering a delete the server refuses and hiding the button that answers the
refusal. So the affordance is driven by the server's answer: a refusal arriving with the delete
panel open sets `keepOffer`, and "Delete the rest, keep her photo" appears at the one moment it
is the fix. `keepOffer` is read off `mode === 'delete'`, never off the message text, so no
string matching sits between a server sentence and a button.

**Deletes go rows first, blobs afterwards, and both panels say so** — a file left behind is
recoverable, a missing file under a live row is a broken picture in her album. The reap is
best-effort in chunks of 100; a failed chunk is logged, not surfaced. One field on
`AdminActionResult` keeps the explorer from stranding itself: `folder` is where to look once the
operation landed (created folder, post-rename path, deleted folder's parent), every `onOk` reads
it, and a create additionally calls `onFolderCreated` so the next drop lands in the folder just
named. `count` reports rows touched, not rows asked for.

### "Share link to Nina" — an ordering problem, not a UI problem

- **The tab opens before anything is awaited.** `window.open` is granted on transient user
  activation, which Chrome expires ~5 s after the click; the describe behind this button is the
  8–11 s vision pre-pass. `startTransition` runs its callback synchronously to the first
  `await`, so the request is on the wire before `window.open` executes — still inside the
  gesture.
- **The race that remains is honest.** `resolveAttachment` copies the description at *send*
  time, so the describe has the new tab's whole load plus typing time. If it loses, the send
  still works and she has nothing to say about the picture — the normal state of any
  un-described photo. Failures are `console.error`'d, never surfaced; the pane's describe button
  is the retry.
- **`'noopener'` is not optional, and it is what makes it a tab**: stripped from the feature
  string *before* the popup check, the remaining feature map is empty and the result is a tab.
  It returns `null` by spec, so there is no popup-blocked branch — the browser's own indicator
  is better than anything this component could render.

Two props carry the judgements this component must not make: `described` is a **required
boolean, never the prose** (invariant 5 keeps `description` out of the component; required, so a
row that forgets it is a compile error, not a silent vendor call), and `shareOrigin` is a
**required string from the server** (`lib/share/origin.ts` opens with `import 'server-only'`, so
nothing client can call it). It calls `ensureNinaAvatarDescriptionAction`, not the unconditional
describe: the common case costs one indexed read, the `described` guard skips even that, and
only a never-shared photo pays the 8–11 s. It sends **nothing** — it arms the composer; the new
tab owns the rest. The URL is built by `ninaPhotoShareUrl` (`lib/admin/shareToNina.ts`, pure
and therefore Node-tested), never a template literal here.

## The framing studio

**`CropStudio` is multi-pointer, and that is what makes it work on a phone.** Every contact is
tracked in a Map keyed by `pointerId`: one pans, two pinch, and lifting either ends the pinch
rather than re-pairing with whatever is still down (the old single-`last` ref stranded the first
finger when a thumb landed mid-drag). The pinch does not move the arithmetic budget: one
subtraction, one `Math.hypot`, and the RATIO of spans goes to `zoomCrop` unchanged — every clamp,
bound and re-centring lives in `lib/nina/crop.ts`, unit-tested there. `select-none` and
`[-webkit-touch-callout:none]` are load-bearing: without them a press-and-hold raises iOS's
Copy/Share callout mid-drag.

Three non-obvious mechanics: **the wheel listener is registered by hand with
`{ passive: false }`** (React's root `wheel` listener is passive; an `onWheel` prop warns and
the page scrolls while the studio zooms); **`crop`, `natural` and `onChange` are mirrored into
refs in an effect with no dependency array** so the hand-registered listener never closes over a
stale one (an effect, not a render write — `react-hooks/refs` forbids the latter); and **the
zoom slider emits a factor, not an absolute scale**, so the frame centre holds still exactly as
the wheel does. Keyboard: arrows nudge, shift ×5, `+`/`-` zoom; `touch-none` so a touch drag
pans instead of scrolling. Controlled, not stateful — the crop lives in the host pane, because
"Save framing", "Reset framing" and the dirty marker are its business.

**`CircleFrame`** is `ninaCropStyle(natural, resolveCrop(crop))` applied to an absolutely
positioned `<img>` inside an `overflow-hidden rounded-pill` box:

```
span = (naturalEdge · scale · 100) / min(width, height)   // % of frame; cover at scale 1
left = 50% + (crop.x / 10) − spanWidth / 2                // offsets in thousandths of width
top  = 50% + (crop.y / 10) − spanHeight / 2
```

Everything is a percentage, never `transform: translate()` — a percentage translate resolves
against the *image's* own box, so the same three numbers would mean different things at 28 px
and 512 px. **The box must be square**: `top: N%` resolves against height while `left: N%`
resolves against width, so a non-square box silently stretches the y offset — that is why
`sizeClass` is documented square-only rather than validated. `crop === null` is legal and
renders as centred cover (`resolveCrop(null)` is the identity, and a partial triple or `NaN`
folds into it). `alt=""` always — the frame is decorative.

## The character panel

`CharacterPanel` is the whole of `/admin/personality` (the album is the whole of
`/admin/nina`; the old stacked-and-collapsed placement was repealed by its user). Two details
that look like details: the root is a plain `<section>` — `open` was never a prop, and
`revalidatePath` re-renders after every save, so a disclosure would fight the operator — and
`id="character"` stays on it so a kept bookmark lands somewhere real.

### One save, and every control commits itself

There are ~twenty controls and exactly ONE Server Action behind all of them
(`saveNinaTuningAction`; the reset action and schema are deleted, `tests/admin.tuning.test.ts`
pins the one-export count). That is a platform constraint, not tidiness: **Server Actions
dispatch one at a time per client**, so sixteen sliders each firing their own save would queue
sixteen round trips. Every dispatch carries the whole tuning — scores, relationship, `enabled`
map, notes — posted whole from `useState`. Auto-save is safe because of three facts: one row per
account, upserted (`nina_tuning`); one operator (no second editor's draft to overwrite);
sequential dispatch (commits cannot interleave). The failure mode of auto-save here is a wasted
round trip, never a half-written character.

Commit moments, `MemoryTable`'s rule control-kind by control-kind:

- **Notes commit on BLUR** — a keystroke debounce would queue actions AND re-renders and the
  cursor would fight them; blur is exactly one write per finished edit.
- **Relationship radios and toggles commit on CHANGE** — a discrete control's change IS the
  finished edit.
- **Dials commit DEBOUNCED**, `TUNING_DIAL_COMMIT_DEBOUNCE_MS = 600` (declared in
  `lib/admin/tuningModel.ts`, beside every other bound this package imports rather than
  re-declares). A range input fires `change` on every move and KEEPS FOCUS after release, so
  blur does not exist for a slider; the debounce is the settle detector. The timer is cleared —
  not flushed — on re-arm, on subsumption by an immediate commit, and on unmount: an edit the
  timer never fired for was never committed, exactly as an unclicked Save was never committed.

Three consequences worth writing down:

- **`saved` is the panel's own state, updated ONLY from the action's result**, which carries the
  coerced row and the re-rendered route in one round trip. Nothing else writes this row, so
  reading it off the result is the same freshness as reading it off a re-render.
- **The draft does not blindly adopt the canonical row**: `mergeTuningAfterSave(current, sent,
  canonical)` adopts stored values only for fields still equal to what was dispatched — a field
  edited since keeps the newer local value and rides the next commit. Same comparison
  `changedTuningFields` makes, so the merge and the pending dots always agree.
- **Nothing is disabled while a save is in flight.** Locking on every debounce settle would
  flicker the whole panel uneditable for a round trip at a time; editing during a save is safe
  (the merge above + whole-draft commits). `pending` drives only the status line.

The honest cost: a commit carries the notes as they stand, so an unfinished sentence can spend a
moment as the stored row if a dial settles mid-edit. The alternative — sending a stale value to
"protect" it — would write an older draft over newer words, the one failure this pipeline exists
to prevent.

The **status line** is tri-state in the section header, `aria-live="polite"`: **Saving…** covers
both halves of the pending window (in-flight commit + armed timer), **Saved** is the success
surface, **Unsaved edits** shows while he types and after a failed save (whose sentence renders
once, red, at the foot). The per-row unsaved dot folds a row's two unsaved paths into one mark,
measured against the live `saved`. A checkbox edits `draft.enabled[key]` and nothing else —
**switching a parameter off never clears the number it is parked at**: park `flirty` at 80,
exclude it, get the 80 back with one click.

**Where "back to defaults" lives:** the global reset control is gone; what survives is
`DialSlider`'s per-dial "default *N*" chip, a draft edit like any other, writing through
`onChange` so the commit rides the settle debounce. The defaults come from the server — the
`defaults` prop is `NINA_TUNING_DEFAULTS` mapped by the page — because a client that
re-implemented them would be a second definition that one day disagrees.

**Why the slider is a new primitive:** `components/ui` has `Input`, `NumberInput` and
`CONTROL_CLASS` and no range control; a trait is a coarse feel ("how angry, roughly"), not a
figure to type. `DialSlider` stays in `components/admin` until a second package needs it — the
standing rule about premature promotion.

**Where the labels come from:** every slider's label/hint, every relationship's label and words
come from `lib/nina/tuning.ts`, read through `lib/admin/tuningModel.ts`, the client-safe adapter
(a Server Component cannot read a plain export out of a `'use client'` module, and
`/admin/personality` and `/admin` need the same vocabulary). A local copy would drift
invisibly: the hint would promise one behaviour while the prompt produced another.

**The prompt preview is a string prop, and that is invariant 5 adjacent:** the panel shows the
prompt her SAVED settings assemble to, handed down from `app/admin/personality/page.tsx`, which
calls the pure assembler. It trails the draft by design — the header says "(as saved — the edits
above are not in it yet)" — and is never fetched, never a model call:
`scripts/check-llm-payload-boundary.mjs` Rule 2 forbids awaiting a model call from a page
render, by function name.

**What this panel does NOT do:** it does not write memory. The tuning is deliberately not a
memory slot — the distiller may overwrite anything not marked `source: 'admin'`, so a tuning in
a slot is a character she could eventually rewrite about herself.

## The text-model select

`TextModelSelect` sits beside `CharacterPanel` on `/admin/personality` and picks which GLM
writes every text turn (`lib/llm/catalog`: `glm-5.3`, `glm-5.3-flash`). It is deliberately NOT
a control on the panel: the character panel edits ONE row through ONE action with an idempotent
whole-row upsert, and its draft/merge machinery assumes that shape — this select writes a
different row with a different blast radius (every text call in the app), so bolting it in would
mean a field the tuning save does not write, or a second action smuggled behind the one-action
invariant. It is optimistic with revert-on-failure (one operator, one row, sequential dispatch),
commits on change, and shows the saved value as effective immediately: `narrativeModel()` reads
the row live, no cache, so the next turn is on the new model with no deploy.

## `/admin/image-generation`

`ImageGenPanel` is the whole content of the route: the operator's STANDING OPINION about her
photographs. It is not the scene — the scene is hers per photograph, which is why the preview
stands one in (`ADMIN_IMAGE_PREVIEW_SCENE`) and says so.

**The editable prompt template (the 2026-09-10 "the template IS the prompt" ask).** A
`NINA_PROMPT_TEMPLATE_MAX` textarea whose content is the prompt itself, `{{placeholder}}` tokens
marking where changing values land (wardrobe, ticked focus terms, scene); a line whose value is
empty takes the whole line with it. A legend of the placeholders renders from
`NINA_IMAGE_TEMPLATE_SPECS` — the same no-copy-table rule as every other word on the page.
"Reset to default template" is an immediate commit that stores `defaultTemplate` itself (the
prop is server-assembled, because importing the canon-interpolating assembler here would ship
the whole persona canon to the browser to save one string). **The guard is not in the
browser**: the textarea is an ordinary control, and every protection lives on the server —
`saveNinaImagePrefsAction` refuses an unknown placeholder, a stray brace, or a missing
`{{camera}}`/`{{subject}}`/`{{scene}}` with a sentence naming the violation, and
`buildNinaImagePrompt` degrades a failing template to the shipping shell. The worst this box can
do is fail a save with a precise error; the failure it exists to make impossible is a BROKEN
PROMPT.

**The image model select.** A closed two-option select (`NINA_IMAGE_MODEL_IDS`), label and hint
from the specs, committing on change like every discrete control and riding the one whole-row
save; the new camera is on the next generation with no invalidation step.

**Auto-save, `CharacterPanel`'s pipeline control-kind by control-kind** — one action
(`saveNinaImagePrefsAction`), the whole `ImageGenDraft` every time, safe for the same four
reasons (one writer, one operator, sequential dispatch, idempotent upsert). Dial debounced
`IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS = 600`; the six focus checkboxes, the reference pick and the
model on CHANGE (each disarming the timer, so an immediate commit subsumes anything pending);
the five text controls (four fields + template) on BLUR. The immediate path passes the value the
control just produced, because a `setState` has not landed when its own `onChange` runs. The
fire-time equality check reads the LIVE draft/saved through a ref mirror, so a subsumed timer
dispatches nothing. `saved` is maintained only from the action's result;
`mergeImageGenAfterSave` adopts canonical values per-field, the imagegen twin of the tuning
merge. Nothing is disabled during flight. `tests/admin.imagegen.test.ts` asserts the
client-import boundary.

**R1's four body facts are unconditional text** in the assembler's subject paragraph — *"always
explicitly instruct these in the prompt"* is a requirement — so the six checkboxes are ADDITIVE
emphasis and cannot undress the subject paragraph; the page says so, and the real-assembler
preview proves it. Each focus card is its label and nothing else (the hint line that rendered
the lowercased label back at the operator was purged). **The four text fields each grew a ✕**
(2026-09-12): clearing is an edit like any keystroke — it rides the normal blur commit rather
than a second write path — and the click refocuses the control so the on-screen keyboard never
drops.

**`PhotoReferencePicker`** — album and chat photographs as one caption-less, gapless,
square-tile wall in the iOS Photos idiom; single selection, `aria-pressed`, reveal-by-48,
`loading="lazy"`. It cannot announce which set a tile came from because `PhotoReferenceItem`
carries no provenance field — three fields, no fourth, which is what makes "no captions, no
dates" structural. The draft-side selection is the opaque key string (`''` is nothing selected);
`ImageReferenceOption` (`lib/admin/imageGenModel`) is the server-mapped shape.

**`ImageGenTestPanel`** — *"add a test prompt button, so we can see if this prompt is actually
allowed by guardrails."* It does NOT await the generation: the click opens a job off the SAVED
prefs and returns; a mount read (through a `setTimeout`, per the `set-state-in-effect` rule)
brings the quota and the saved-prompt preview before anything is spent — reading the quota
itself, because a chat selfie can spend it between renders and a server-rendered number would
be a stale promise about money. The poll is ONE sequential async loop (never a `setInterval` —
a tick must not fire while the previous request is in flight, against a job that takes
78–235 s), escalating via `imageTestPollDelayFor`, bounded three ways: terminal verdict,
`NINA_IMAGE_TEST_GIVE_UP_MS` (8 minutes — the job itself is still open; the server gives a stuck
one up at twenty), and unmount. A failed READ is not a failed test: it is reported quietly and
the loop continues. Verdict headline and clause are exhaustive records in
`lib/admin/imageGenTestView.ts` — the provider's refusal is the one path that renders as
"refused"; transport/timeout class failures render inconclusive — and the pipeline's recorded
reason prints under them. The quota line is the disclosure (one generation + its caption off
`NINA_IMAGE_DAILY_CAP`; failures count; the cap rolls at midnight Jakarta time); `dirty` from
the panel above turns "the test reads the saved settings" into a warning. A successful test
lands in the Image collection's Media folder with a caption bubble, because a chat photo cannot
exist without a message to hang on.

## `/admin/memory`

`MemoryTable` is the whole content of the route (R1: *"just make all the memory to show as one
simple table. i can easily edit, add or remove one row easily"*), mounted under a `UserPicker`
with `?user=` defaulting to the signed-in admin. It replaced two card components
(`MemoryLedger`, `MemorySlots` — deleted) that between them had four two-step flows.

**ONE table, three `<tbody>` groups** — Slots (eight closed keys), Pending promises (delete is
the only edit), Ledger (newest first, the add row lives here) — each with a `scope="colgroup"`
header row: one table, still scannable, every row sharing the columns. Five columns: **What ·
Value · Origin · When · ✕**. Origin and When are `hidden lg:table-cell` below `lg` — they are
the two the operator reads but never acts on, and five columns need ~854 px a phone does not
have. The `Conf.` column left entirely with the confidence pipeline's removal:
`nina_memory_facts.confidence` is gone from the database, so there is nothing for a cell to
show. **The `<colgroup>` had to go for the hiding to be safe** — a `<col>` maps to a column by
POSITION among the cells actually rendered, so hiding two `<td>`s would slide the delete cell
into Origin's 250 px; the widths live on the `<th>`s, which carry them hidden or not. Do not put
the `<colgroup>` back.

Mechanics, each deliberate:

- **Blur saves, one field at a time.** Next dispatches Server Actions one at a time per client
  and every action drags a re-rendered route back in its own response — a keystroke debounce
  would queue both and the cursor would fight them. `Escape` reverts; `Cmd`/`Ctrl+Enter`
  commits without leaving the cell; the category `<select>` saves on CHANGE (a select's change
  IS the finished edit).
- **Each cell's draft follows its prop, adjusted DURING RENDER** (the sanctioned React pattern;
  an effect paints the stale draft for a frame and the lint rule rejects it). The comparison is
  against the VALUE, never the row object — `revalidatePath` hands every row a fresh object on
  every write, and identity comparison would wipe untouched drafts.
- **Optimism, only where it is honest.** The DELETE is optimistic (`useOptimistic` inside the
  transition that requires it), and `reappears` is the whole slot rule: deleting one of the
  eight closed keys removes the VALUE, not the key, so the honest optimistic state is the BLANK
  row it is about to become — not its absence. Edits are NOT optimistic, because
  `canonicaliseSlotValue` may store something other than what was typed ("tuesdays and
  thursdays" → "Selasa, Kamis"); the canonical form simply appears when it lands.
- **An emptied cell is refused, not a delete** — a stray select-all-and-tab must not destroy a
  row when the one-click delete is two columns away.
- **Editing a distilled row makes it yours** — `editFactAction` re-labels it `admin` and stops
  it quoting the message it came from. The add row (top of the ledger group, newest-first table)
  is an `<input>` so `Enter` means "add"; it writes as `admin`, with no message behind it and no
  distillation that can rewrite it. The category survives a successful add.
- **`CONTROL_CLASS` is deliberately not used**: it is a 52 px form control with a block label,
  and overriding four of its utilities would depend on Tailwind's emission order. `CELL_CONTROL`
  is built from the same tokens at table density — and it is `text-base` below `lg` because the
  iOS 16 px focus-zoom rule beats the design (`app/globals.css`'s base layer sets
  `max(16px, 1rem)`; a utility in `@layer utilities` beats it, which is exactly how the old
  13 px re-opened the hole). `min-h-11` is the 44 px target, back to `min-h-0` at `lg` so a
  forty-row ledger is still one screen.
- **The table scrolls inside its own `overflow-x-auto overscroll-x-contain` box** — without the
  containment, flicking past the edge hands the scroll to the page, and on iOS a horizontal
  overscroll at the left edge is the back-swipe.

The page builds every row on the SERVER (`buildMemoryRows` in `lib/admin/memoryVocab.ts`, over
reads from `lib/admin/memoryStore.ts`): the vocabulary reaches zod and the drizzle schema, so
building rows server-side keeps `MemoryTable` on plain serializable props importing only
zero-value-import `lib/admin/memoryModel.ts`. `tests/admin.memory.test.ts` asserts the
client-safety structurally. Writes go through four actions in `lib/admin/memoryActions.ts`:
`saveSlotAction`, `insertFactAction`, `editFactAction`, `deleteMemoryRowAction` — each returning
the `AdminMemoryResult` envelope (`ok` / `error?` / `canonical?` / `note?`); the retraction,
purge-with-typed-confirmation, record-as-fact, retire and remove-promise actions retired with
the cards they served.

## `/admin/shortcuts`

`ShortcutTable` is the whole content of the route under a `UserPicker basePath="/admin/shortcuts"`
— **`MemoryTable`'s mechanics with different columns**, deliberately: both pages are operated in
the same session by the same thumb, and a second set of table mechanics would be a second set of
ways to lose an edit. `CELL_CONTROL`/`CELL`/wide-only tokens verbatim; no `<colgroup>`; the same
scroll-containment.

Six columns: **✓ · trigger · label · expansion · fired · ✕**. The on/off checkbox LEADS the row
(2026-09-10: the two-word dropdown it replaced cost two clicks where a toggle owes one) and is
`DialSlider`'s per-dial idiom whole — `TOUCH_ICON` `<label>` as the 44 px hit target, `sr-only`
name. `Fired` is the only column hidden below `lg`: five of the six are things the operator
*acts* on; `Fired` is telemetry he *reads*, a question asked at a desk. The add row is a row of
the table at the TOP (newest-first), an `<input>` + `<textarea>` (2000 characters of scene, so
`Enter` there means newline and `Cmd`/`Ctrl+Enter` is the chord — the FIRST click of a create).

**Blur saves, one field at a time** — the draft-follows-prop-during-render pattern and the
value-not-identity comparison, as on `/admin/memory`. `Escape` reverts; an emptied cell is
**refused rather than treated as a delete**. **Only the delete is optimistic** — a
`useOptimistic` plain filter, because a shortcut has no closed vocabulary that would
manufacture the row again. `row.enabled` deliberately has NO draft — the checkbox renders the
prop, so a refused toggle never flashes "on"; it saves on change. **There is no confirmation
anywhere**, and `tests/admin.shortcuts.test.ts` asserts the absence of every dialog and
second-click API *by name* — which is why the component's docstring never spells those names
while explaining them (a text guard cannot tell an explanation from a reintroduction).

**This file names no `@/lib/nina/` specifier at all** (a test asserts it): the three
`maxLength` caps come through `@/lib/admin/shortcutModel`, which re-exports them from the pure
matcher module — the boundary should be one file wide rather than resting on a property of a
file in another directory that a `'use client'` component now names. `matchKey` and `kind` are
carried on every row and rendered nowhere.

`AdminNavLinks`' `LINKS` carries Shortcuts last (newest surface, adjacent to the page it grew
out of); the 8-character `short` ceiling retired with the text it measured — `short` is now the
sr-only accessible name of a glyph cell, and a genuinely new route would widen the bar to
`grid-cols-7` (59 px a cell, still past 44 pt) rather than reopen a two-row text layout.
`UserPicker` gained exactly one optional prop, `basePath`, for this page — a prop, not a
`usePathname()` read, for the same going-client-to-bold-a-word arithmetic as ever. The pill
counts stay MEMORY counts: still true of the account, just not of this page.

## Dependencies

### External

- `next/link`, `next/navigation` — `<Link>` navigation; `useRouter().push` for folder ops.
- `@vercel/blob/client` — `upload()`, minting a token against `/api/admin/nina/upload`.
- `react` — `useState/useEffect/useRef/useCallback/useMemo/useTransition/useOptimistic`.

### Internal

- `@/lib/admin/filetree` — the folder grammar and upload diff: `planFolderUpload`, `buildTree`,
  `folderAncestors`, `folderBreadcrumbs`, `folderName`, `folderParent`, `isInFolderTree`, the
  `LocalFileLike`/`UploadRefusal`/`FolderNode`/`PlannedUpload` types, and the media arm's
  `NINA_MEDIA_VIEW_PARAM`/`NINA_MEDIA_VIEW_VALUE` + `readExplorerView` (writer and reader in one
  module) plus `NINA_MEDIA_NODE_LABEL`/`mediaViewNode`. **Zero-import** — which is why client
  files may import it.
- `@/lib/admin/chatPhotoActions` — the media arm's six writes (`add`, `replace`, `remove`,
  `editChatPhotoDescription`, `findChatPhotoDuplicate`, `describeChatPhotoAction` — the vision
  overwrite that refuses a reference row and picks its subject through `describeSubjectForSide`).
  A `'use server'` module, so it crosses as a client reference and its Zod stays server-side.
- `@/lib/admin/chatPhotos` — the media collection's pure model: `adminChatPhotoPathname` (the
  only producer of that pathname shape), `ADMIN_CHAT_PHOTO_CONTENT_TYPE`,
  `ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS`, `ADMIN_CHAT_PHOTOS_PATH` (value `/admin/nina` — the
  route every media action revalidates). No zod, no database — which is why a client file may
  name it.
- `@/lib/photos/contentHash` — `contentHashOf`, sha-256 over the exact bytes PUT.
- `@/lib/admin/ninaAlbumActions` — every album write: `registerNinaAvatarsAction`,
  `listNinaAlbumManifestAction`, `setCurrentNinaAvatarAction`, `saveNinaAvatarCropAction`,
  `deleteNinaAvatarAction`, `describeNinaAvatarAction`, `editNinaAvatarDescriptionAction`,
  `ensureNinaAvatarDescriptionAction`, the six folder/move ops, and the Media view's
  `setChatPhotoAsAvatarAction` (id + DRAFT scale/x/y → bytes copied into a fresh `avatar-`
  object). `AdminActionResult` comes from here too — since R3 it carries an optional
  `description` so fresh prose reaches the panel in the describe round trip.
- `@/lib/admin/folderOps` — **not imported, deliberately.** It holds every folder refusal and
  the Zod schemas behind them; the components call actions and render sentences. (There is no
  `lib/admin/folderPath.ts`; reconciliation deleted it.)
- `@/lib/admin/shareToNina` — `ninaPhotoShareUrl(origin, avatarId)`, the only writer of the
  `/nina?photo=avatar:<id>` link. Near-zero-import, so client files may import it.
- `@/lib/admin/avatars` — `adminAvatarPathname`, `adminAvatarThumbPathname`, `extForContentType`,
  `ADMIN_AVATAR_MAX_UPLOAD_BYTES`, `ADMIN_AVATAR_MIN_EDGE_PX`.
- `@/lib/admin/schema` — `AvatarBatchRecord`, **type-only**.
- `@/lib/nina/crop` — the whole crop model: `NinaCrop`, `resolveCrop`, `isIdentityCrop`,
  `ninaCropStyle`, `panCrop`, `zoomCrop`, `nudgeCrop`, `zoomFactorForWheel`, the scale bounds.
- `@/lib/nina/album` — `NINA_ADMIN_BATCH_MAX`, `NINA_CHAT_PHOTO_PAGE_SIZE`.
- `@/lib/photos/resizeTarget` — `longEdgeTargetFor`.
- `@/lib/id` — `newId()`, minting the id both album blobs share.
- `@/lib/admin/imageGenActions` — `saveNinaImagePrefsAction` (the panel's one write, template
  guard included) and the test pair `runNinaImageTestAction` / `readNinaImageTestAction` with
  their result types. A `'use server'` module.
- `@/lib/admin/imageGenModel` — the panel's client-safe model: `ImageGenDraft`,
  `changedImageGenFields`/`imageGenDraftEquals`, `mergeImageGenAfterSave`,
  `IMAGEGEN_DIAL_COMMIT_DEBOUNCE_MS`, `ADMIN_IMAGE_PREVIEW_SCENE`, the copy adapters
  (`imageFocusCopy`, `promptLengthCopy`, `imageModelLabel`/`Hint`), `referenceKey`/
  `parseReferenceKey`, `ImageReferenceOption`.
- `@/lib/admin/imageGenTestView` — the test panel's derived view: verdict records
  (`NINA_IMAGE_TEST_VERDICT_LINE`/`_WHY`), `imageTestVerdict`, `imageTestReason`,
  `imageTestPollDelayFor`, `NINA_IMAGE_TEST_GIVE_UP_MS`.
- `@/lib/nina/imageprefs` — the panel's every label, hint, placeholder and bound
  (`NINA_IMAGE_TEXT_SPECS`, `NINA_IMAGE_TEMPLATE_SPECS`, `NINA_IMAGE_MODEL_IDS`, the `*_MAX`
  constants, `NINA_PROMPT_TEMPLATE_MAX`). Zero-import, guaranteed client-safe by phase 1.
- `@/lib/nina/jobview` — `formatJobLatency`, `formatMicroUsd` for the test panel's job line.
- `@/lib/admin/memoryActions` — `/admin/memory`'s four writes: `saveSlotAction`,
  `insertFactAction`, `editFactAction`, `deleteMemoryRowAction`, plus `AdminMemoryResult`.
  A `'use server'` module.
- `@/lib/admin/memoryModel` — `MemoryRow`, `AdminFactCategory`, `ADMIN_FACT_CATEGORIES`,
  `ADMIN_FACT_TEXT_MAX = 400`, `ADMIN_SLOT_VALUE_MAX = 400`, `ADMIN_LEDGER_PAGE = 200`.
  Zero value imports — which is what keeps the table client-safe.
- `@/lib/admin/tuningActions` — `/admin/personality`'s ONE write: `saveNinaTuningAction` +
  `AdminTuningResult` (a test pins the one-export count).
- `@/lib/admin/tuningModel` — `TuningDraft`, `changedTuningFields`/`tuningDraftEquals`,
  `mergeTuningAfterSave`, `TUNING_DIAL_COMMIT_DEBOUNCE_MS`, `tuningCopy`, `relationshipCopy`,
  `loudestDials`; the panel takes its key arrays and bounds from `@/lib/nina/tuning` directly.
- `@/lib/admin/textModelActions` — `saveNarrativeTextModelAction`, exactly one export (test
  pinned), + `NarrativeTextModelResult`.
- `@/lib/llm/catalog` — `NARRATIVE_TEXT_MODEL_IDS`, `NARRATIVE_TEXT_MODEL_SPECS`,
  `coerceNarrativeTextModel`.
- `@/lib/admin/shortcutActions` — the four shortcut writes + `AdminShortcutResult`.
- `@/lib/admin/shortcutModel` — the trigger/label/expansion caps, `ADMIN_SHORTCUT_PAGE`,
  `formatFired`, the `ShortcutField`/`ShortcutRow` types. **The only module `ShortcutTable.tsx`
  takes its bounds from**, so that file names no `@/lib/nina/` specifier (test asserted).
- `@/lib/admin/users` — `AdminUserRow`, **type-only** (`UserPicker`).
- `@/lib/db/schema` — `NinaImageKind`, **type-only** (`explorer/model.ts`), so no drizzle table
  module reaches the bundle.
- `@/components/ui` — `Button`, `ButtonLink`, `EmptyState`, `Card`, `Field`, `CONTROL_CLASS`,
  `buttonClasses` (exported precisely so a non-`<button>` — or a `<button>` that must keep
  `onClick` on itself — can borrow the look), and `useSavePhoto`/`SaveNotice`
  (`@/components/ui/useSavePhoto`), the shared save/download/open ladder both rails warm on
  `pointerdown`.
- `@/lib/cn` — `cn()`.

**No runtime import in this directory reaches `zod`, `server-only`, or the database.** The three
type-only imports above erase at compile time. `NINA_ADMIN_BATCH_MAX` comes from
`lib/nina/album.ts` rather than `lib/admin/schema.ts` because a module-level `z.object(...)`
is a side effect no bundler tree-shakes; `folderOps.ts` is the same trap one seam later;
`saveNinaTuningAction` is the rule holding in the other direction — a `'use server'` export is
imported as a client reference, so the action's module body, Zod included, never reaches the
calling bundle. `lib/share/origin.ts` is the mirror: it opens with `import 'server-only'`, so
`shareOrigin` must arrive as a prop from the Server Component that can read it.

## Reverse Dependencies

### Primary consumers

- `app/admin/nina/page.tsx` — `FileExplorer` + the `explorer/model.ts` types. Gates with
  `requireAdmin()`, `readExplorerView` picks the table (`listNinaAvatarsInFolder`, or
  `listNinaMediaPhotos` paginated at `NINA_CHAT_PHOTO_PAGE_SIZE = 48`), `countNinaMediaPhotos`
  feeds the tree badge on both arms, media rows are mapped down server-side (`kind` as `source`,
  `side` via `photoSideOf`, display filename derived from date + id), and `shareOrigin()` is
  read HERE — the only place that can — and passed down as a string. `announcedAt`, `pathname`,
  `sourceKey` and `thumbPathname` never cross the boundary.
- `app/admin/personality/page.tsx` — `CharacterPanel` (ONLY mount site) **and
  `TextModelSelect`**. Reads the tuning, assembles the prompt preview as a pure string,
  resolves the effective narrative model server-side.
- `app/admin/image-generation/page.tsx` — `ImageGenPanel` (only mount site). Maps the saved row
  to `ImageGenDraft` (`toImageGenDraft`), passes `NINA_IMAGE_PREFS_DEFAULTS` as `defaults`,
  assembles `promptPreview` and `defaultTemplate` server-side, and pages the reference union
  into `references`/`photoTotal`.
- `app/admin/memory/page.tsx` — `MemoryTable` + `UserPicker`. Builds every row server-side
  (`buildMemoryRows` over `memoryStore` reads, promises lifted out of the
  `NINA_SLOT_PENDING_PROMISES` slot), passes `factTotal`/`hiddenCount`.
- `app/admin/shortcuts/page.tsx` — `ShortcutTable` (only mount site) + `UserPicker` with
  `basePath="/admin/shortcuts"`. `force-dynamic`, rows built server-side by `buildShortcutRows`.

### Secondary consumers

- `app/admin/layout.tsx` — `AdminNav`.

### Internal to the package

- `FileExplorer` re-exports the `explorer/model.ts` types so a consumer needs one import path;
  it is the only consumer of `PhotoMoveBar` and `MediaAdd`, and holds the removal `notice`.
- `explorer/FolderTree.tsx` is the only consumer of `FolderMenu` (once per `Row`, root included,
  Media row never). `MediaPane` is the only consumer of `MediaControls`. `PhotoDescription` has
  TWO consumers (`AlbumSelectionPane`, `MediaPane`), one mount each, each handing in its own
  table's closures. `MediaAdd`/`MediaControls` are the only consumers of
  `explorer/chatPhotoUpload.ts`. `shareOrigin` is a pure pass-through in `FileExplorer`,
  consumed only on the album arm. `CropStudio`/`CircleFrame` are drawn by BOTH arms — stored
  crop vs adoption draft, which is the point of the studio measuring its own frame.
- `ImageGenPanel` is the only consumer of `PhotoReferencePicker` and `ImageGenTestPanel`;
  `CharacterPanel` and `ImageGenPanel` share `DialSlider`.
- `app/admin/memory/page.tsx` and `app/admin/shortcuts/page.tsx` are `UserPicker`'s two call
  sites — the reason the `basePath` prop exists.

### Test consumers

Three layers, none of them an accident:

1. **Colocated component suites** — 27 `*.test.tsx` files beside the components, each opening
   with `// @vitest-environment happy-dom` (the repo default is `environment: 'node'`;
   `components/**/*.test.tsx` is in vitest's include). Every component in the module map has
   one; they drive real DOM interactions (dispatches, optimistic tables, the upload state
   machine, the test panel's polling loop under fake timers).
2. **Pure-logic suites in `tests/`** — everything decidable was put in `lib/` to be tested
   there: `admin.filetree`, `admin.folderOps`, `admin.chatPhotos`, `admin.chatPhotoDedupe`,
   `admin.photoReference`, `admin.shareToNina`, `admin.tuning`, `admin.imagegen`,
   `admin.imagegenTest`, `admin.memory`, `admin.shortcuts`, `admin.memoryActions` and friends.
3. **Text-reading suites** — read a file in this directory AS TEXT to pin a property no runtime
   test can carry. `admin.shell.test.ts` reads `AdminNav.tsx`/`AdminNavLinks.tsx` for the
   `grid h-14 max-w-[470px] grid-cols-6` row, the `h-14`/`pb-[calc(5rem+var(--safe-bottom))]`
   pair (the two must move together), the sr-only names and six distinct glyphs.
   `admin.shortcuts.test.ts` asserts `ShortcutTable.tsx` names no `@/lib/nina/` and no
   `server-only` specifier and contains no dialog or second-click API. `admin.tuning.test.ts`
   holds the auto-save model across `CharacterPanel.tsx`/`DialSlider.tsx` (removed labels
   nowhere in raw source, the debounce path, blur-only notes, `tuningDraftEquals` guard sites).
   `admin.mediaPane.test.ts` pins the dispatcher, the pane keyed by `photo.id`, the prompt
   toggle INSIDE its conditional, both arms mounting `<PhotoDescription`, and
   `MediaDescription.tsx`'s absence. These are guards against a future edit, which is why the
   docstrings in the guarded files never *spell* the specifiers and names they explain: a text
   guard cannot tell an explanation from a reintroduction (the tuning suite splits the
   difference with `codeOnly()`, which strips block comments for identifier assertions).

## Data flow

```
app/admin/nina/page.tsx  (Server Component, force-dynamic, requireAdmin() on line 1)
  │  validateFolderPath(?folder) · readExplorerView(?view) · parallel reads
  │  shareOrigin()   ← server-only, resolved HERE, handed down as a string
  ▼
FileExplorer ─── FolderTree ─────────► <Link href="?folder=…">  (server re-read)
     │             └── Row/FolderMenu ► create/rename/move/delete folder
     │                    │             └─► AdminActionResult.folder ──► navigateToFolder()
     │      ─── PhotoMoveBar ─────────► moveNinaAvatarsAction([selectedId], folder)
     │      ─── PhotoGrid ────────────► <Link href="?page=…">     (server re-read)
     │      └── SelectionPane ══ isMediaRow? ══► MediaPane (keyed by photo.id)
     │                    │           ├─ setChatPhotoAsAvatarAction({id,scale,x,y}) ← DRAFT
     │                    │           ├─ replace/removeChatPhotoAction ← MediaControls
     │                    │           │      └─ a remove's note ──► onRemoved ──► notice
     │                    │           └─ PhotoDescription ► edit/describeChatPhotoAction
     │                    └─ AlbumSelectionPane ► setCurrent / saveCrop / delete
     │                          └─ PhotoDescription ► edit/describeNinaAvatarAction
     │                                 └─► revalidatePath('/admin/nina')
     │                          └── ShareToNinaItem (one click, in this order)
     │                                1. ensureNinaAvatarDescriptionAction ← FIRED, not awaited
     │                                2. window.open(ninaPhotoShareUrl(origin,id),'_blank',
     │                                       'noopener')                ← inside the activation
     │
     │  ?view=media toolbar: MediaAdd ──► encodeChatPhotoJpeg → contentHashOf
     │              ├─ dedupe hit? → findChatPhotoDuplicateAction → SKIP the PUT
     │              └─ PUT selfie-<id>.jpg → addChatPhotoAction (carrier message)
     │
     │  drop ──► entriesFromDrop()  ← SYNCHRONOUS, before any await
     │  pick ──► filesFromPicker()
     ▼
useFolderUpload.run()
   walkEntries() → WalkedFile[]
   listNinaAlbumManifestAction({ folder })       ← what is already here
   planFolderUpload({ base, files, manifest })   ← pure, tested in lib/
   setReport() / setItems()                      ← decide, THEN set
   runLanes(4): measureAndThumbnail → PUT original → PUT thumb → record
   flush every NINA_ADMIN_BATCH_MAX: registerNinaAvatarsAction({ records })
   onFinished() → router.refresh()

app/admin/image-generation/page.tsx ── prefs/defaults/promptPreview/defaultTemplate/
  references/photoTotal as props ──► ImageGenPanel ──► saveNinaImagePrefsAction (whole draft)
                                        └── ImageGenTestPanel ──► runNinaImageTestAction
                                              (job opened) ⇢ readNinaImageTestAction poll
                                              (escalating, 8-min give-up, terminal verdict)
app/admin/personality/page.tsx ── tuning draft + prompt string + effective model ──►
  CharacterPanel ──► saveNinaTuningAction (whole row)   ·   TextModelSelect ──►
  saveNarrativeTextModelAction
app/admin/memory/page.tsx ── buildMemoryRows(memoryStore reads) ──► MemoryTable ──►
  saveSlot / insertFact / editFact / deleteMemoryRowAction ──► revalidatePath('/admin/memory')
app/admin/shortcuts/page.tsx ── buildShortcutRows ──► ShortcutTable ──►
  add / saveCell / toggle / deleteShortcutAction
```

## Concurrency

The upload queue is the package's one genuinely concurrent subsystem, and it is cooperative:
`EXPLORER_UPLOAD_CONCURRENCY` lanes draw from one shared index in `runLanes` (`next++` is safe
because each lane yields only at an `await`); `pending.splice(0, CHUNK)` is safe for two lanes
reaching `flush` because whichever arrives first emptied what it took. Two refs guard the
lifecycle: `busyRef` (re-entrancy for `run`/`dismiss`) and `runRef`, a gesture counter every
post-`await` write checks.

Everything else is ordinary React: one `useTransition` per interactive surface (`AlbumSelectionPane`,
`PhotoMoveBar`, one per `FolderMenu` — so one per tree row — one per `MemoryTable` row operation
plus the add row, one per commit in the two auto-saving panels). `MemoryTable`'s optimistic
delete runs `markDeleted` INSIDE the transition, which is what `useOptimistic` requires.
`CropStudio`'s pointer capture is keyed by `pointerId`.

Two bounded pollers/timers, both with the same hygiene: `ImageGenTestPanel`'s sequential async
poll loop (`cancelled` flag, one `setTimeout` handle cleared on unmount, wall-clock give-up — a
single failed read is not a failed test) and the two auto-save panels' settle timers (cleared on
re-arm, on subsumption by an immediate commit, and on unmount, so no save fires into a dead
component). Because Server Actions dispatch one at a time per client, queued commits cannot
interleave — and each is an idempotent whole-row upsert, which is the property that makes
auto-save safe at all. `MediaAdd`'s multi-file pick is a deliberate NON-concurrency: a
sequential `for` loop, because `Promise.all` would parallelize nothing. Folder operations need
no gesture counter: each is a single awaited action consumed by the `onOk` of the call that made
it.

## Error handling

There are no error types here. Failures surface as strings a human reads, at the granularity he
can act on:

- **Per file**, in `QueueItem.error` ("did not decode", "too small to frame", the PUT's message).
  The lane continues. **Per gesture**, in `FolderUpload.error` — including the honest
  truncated-manifest warning: over-reporting makes files re-PUT and their inserts discarded by
  `ON CONFLICT DO NOTHING`. Slower, never wrong.
- **Per action**, inline where it fired: `AlbumSelectionPane`'s `role="alert"` paragraph;
  `MediaControls`' `basis-full` lines under the icon row; `PhotoDescription`'s own error/note
  paragraphs (both arms); `MediaAdd`'s per-file failure list; `FolderMenu`'s error as one more
  `absolute` overlay so it cannot reflow the rail — always the server's own sentence from
  `lib/admin/folderOps.ts`, never a client paraphrase and never matched on. The one message that
  cannot render where it happened is a successful REMOVE's `note` (bytes still referenced
  elsewhere): the pane unmounts under the revalidation carrying it, so `FileExplorer` holds it
  in `notice` under the toolbar.
- **Per auto-save commit**, in the panel's `result`: the action's own sentence (which names the
  retry that exists now there is no Save button), rendered once as a red paragraph while the
  status line falls back to "Unsaved edits". Nothing was written, `saved` stays put, the pending
  marks still name exactly what did not land.
- **Per memory row**, through `AdminMemoryResult`: `error` as a red line under the cell, `note`
  in accent on success — the one sentence about what *else* the action wrote. A successful
  delete says nothing: the row being gone IS the message (and a slot's blank reappearing row is
  the message for that one).
- **The one refusal with a second answer** is the current photo's: an ordinary error converted
  into an affordance — `FolderMenu`'s `keepOffer`, `PhotoMoveBar`'s pre-click warning — a button
  he presses, not a state the client guessed.
- **Per test-panel poll failure**, a quiet line ("Could not reach the server on that check.
  Still watching.") — distinguishable from a verdict, and non-terminal.

Two failures are deliberately silent, both logged: thumbnail derivation and thumbnail upload.
Both leave `thumbUrl` null, which every consumer handles; neither may fail an upload. Nothing in
this package throws on purpose. The one refusal that cannot move to `lib/` is the minimum-edge
check in the upload path, because only a decode knows the pixels.

## Performance

- **The grid never loads an original when a thumbnail exists**; with `loading="lazy"` and a
  120-row page, that is the whole answer to "hundreds of profile pics". The media arm has no
  thumbnails (no column) and runs 48/page.
- **At most four decoded bitmaps alive at once**, each `close()`d in a `finally`.
- **Parallel bytes, batched bookkeeping**: blob PUTs genuinely overlap through the Route
  Handler; Server Action dispatches are sequential by platform and their latencies add.
- **No vision call on any upload path.** The 8–11 s describe is scheduled by the promote action
  on `after()`; the ONE vendor call a click can start here is `PhotoDescription`'s describe
  button — user-initiated, one row, overwriting by design. The test panel's generation is a
  second, explicitly paid, off the saved row.
- **A folder operation moves no bytes** — one UPDATE of the `folder` column; four hundred
  photographs between folders cost one statement and zero blob traffic.
- `buildTree`, the on-path set, `allFolders` and each menu's `moveTargets` are `useMemo`'d —
  about `<select>` identity more than cost. `UploadQueue` renders a summary plus at most
  `IN_FLIGHT_ROWS = 12` moving rows.
- The prompt preview and the test panel's "prompt as sent" are server-assembled strings; the
  persona canon is never shipped to the browser to re-derive them.

## Usage

### Mounting the explorer

```tsx
// In a Server Component, after requireAdmin().
<FileExplorer
  userId={userId}
  folders={folderList}          // ExplorerFolder[] — { folder, count }, non-empty folders
  photos={photos}               // ExplorerPhoto[] — this view, this page only
  page={pageInfo}               // ExplorerPageInfo
  view={readExplorerView(params.view)}
  mediaCount={mediaTotal}       // the tree badge, both arms
  shareOrigin={shareOrigin()}   // server-only origin, resolved here
/>
```

`userId` is threaded from the session because blob pathnames interpolate it (invariant 3); it
is never read from a request. `shareOrigin` is threaded for the mirror-image reason: the module
that knows the answer cannot be imported by a Client Component.

### Mounting the panels

```tsx
<CharacterPanel tuning={draft} defaults={defaults} promptPreview={buildNinaSystemPrompt(draft)} />
<TextModelSelect model={narrativeModel()} />
<ImageGenPanel
  userId={userId}
  prefs={toImageGenDraft(row)}
  defaults={toImageGenDraft(NINA_IMAGE_PREFS_DEFAULTS)}
  promptPreview={buildNinaImagePrompt({ /* saved row + preview scene */ })}
  defaultTemplate={NINA_PROMPT_TEMPLATE_DEFAULT}
  references={referencePage.rows.map(toImageReferenceOption)}
  photoTotal={referencePage.total}
/>
<MemoryTable userId={target.id} rows={buildMemoryRows(…)} factTotal={target.facts}
             hiddenCount={hidden} />
<ShortcutTable userId={target.id} rows={buildShortcutRows(…)} />
<UserPicker users={users} selectedId={target.id} basePath="/admin/shortcuts" />
```

The panels' `defaults`/`promptPreview`/`defaultTemplate` are server-assembled on purpose: a
client that re-implemented the defaults or shipped the persona canon to preview a string would
be a second definition that one day disagrees (or a canon leak into the bundle).

## Gotchas

- **Do not make the `drop` handler `async`.** The most common way this feature breaks, silently.
  Capture entries first, synchronously.
- **Do not `preventDefault()` a `wheel` event through an `onWheel` prop** — React's root
  listener is passive; register by hand with `{ passive: false }`.
- **Do not `await` anything before `window.open` in `ShareToNinaItem`**, and do not replace it
  with `<Link>`/`router.push` (both navigate THIS tab). User activation expires; *"in a new
  browser tab"* is in the requirement.
- **Do not compute the share origin from `window.location.origin`** (a per-deployment hostname
  that dies at the next push) or a build-time public env var (invariant 9). The prop is the only
  way.
- **Do not build the share URL with a template literal.** `ninaPhotoShareUrl` is the only
  writer, `formatNinaPhotoParam` the only formatter; a second place that knows the grammar is a
  place that can disagree about it.
- **Do not call `readEntries()` once.** 100-entry ceiling, empty array ends it.
- **Do not add a decision to a `setState` updater.** Strict mode double-invokes it; on the
  upload path that was two blobs for one file. Decide, then set.
- **Do not import `zod`, `server-only`, or anything database-shaped into this directory.** A
  constant needed on both sides belongs in a pure module; a type may be imported freely because
  it erases.
- **Do not render `description` on any runner-facing surface** (invariant 5). The admin surface
  is the deliberate exception — `PhotoDescription` renders and edits the prose on BOTH arms.
- **Do not import a server action into `PhotoDescription.tsx`.** The host arm hands in
  `onSave`/`onRedescribe` closures so a rename fails at the call site in that arm.
- **Do not re-grow a describe button in an icon row, an eye toggle, or a null-ness `<dl>` row.**
  R3 removed all of them in favour of the one panel; `tests/admin.mediaPane.test.ts` asserts
  `MediaDescription.tsx` stays deleted and no eye icon remains in `MediaPane`.
- **Do not add a second upload path to the explorer screen.** Two upload paths in one screen is
  exactly what `UploadAvatar.tsx` became and why it was deleted.
- **Do not pass `dedupe` to a Replace.** Add is the only caller; a deduped replace points the row
  at another row's object and strips its provenance to a reference — the photograph the operator
  can see vanishes from the folder.
- **Do not give a media row a stored crop, a "Save framing", or a thumbnail.** No crop column,
  no thumbnail column; `thumbUrl` is typed the literal `null` so it cannot grow one by accident.
- **Do not move the prompt toggle outside its `photo.prompt != null` conditional, or give it a
  dim state.** The column's NULL is the state; the test reads the source.
- **Do not parse or display a chat-photo pathname.** `adminChatPhotoPathname` is the only
  producer of the shape; the served content type is the only authority for the bytes.
- **Do not render a remove's `note` in the pane that removed the row** — it unmounts under the
  revalidation; hand it up via `onRemoved`.
- **Do not put a new pure judgement here.** It cannot be tested in this directory's node-env
  default; put it in `lib/admin/` and import it. (Component behaviour itself IS tested now —
  colocated happy-dom suites — but decisions still belong in `lib/`.)
- **`selectedId` is allowed to dangle.** Do not add an effect to reconcile it; `find(...) ??
  null` is the design.
- **Do not validate a folder name, collision or move target here**, and **do not import
  `lib/admin/folderOps.ts`** — it carries the Zod schemas; the path helpers live in the
  zero-import `filetree.ts`.
- **Do not add an in-page drag protocol to the tree or grid** — those elements are the OS-folder
  walker's `dragover`/`drop`; one handler cannot tell an OS folder from an in-page selection
  without failing silently in both directions. The `<select>` is the gesture.
- **Do not disable a delete because her current photo might be in it.** The client cannot know;
  take `keepOffer`'s route (server refusal → second button), not a `holdsCurrent` prop.
- **Do not treat `pendingFolders` as where a new folder lives** — one-render bridge; the merge
  into `allFolders` is a filter.
- **Do not lay a `FolderMenu` panel out inside `Row`, and do not lower its `z-40`** — the
  panels are `absolute` overlays; `z-40` clears `AdminNav`'s `z-30` bottom bar below `lg`.
- **Do not branch on the text of a refusal.** `keepOffer` comes off `mode === 'delete'`; the
  server owns the wording and must stay free to change it.
- **The thumbnail upload's third argument is `'jpg'`** — the Route Handler cross-checks the
  pathname extension against the declared content type; a mismatch is a 400.
- **Never give `CircleFrame` a non-square `sizeClass`.** Not validated, will not throw; the
  failure is a silently stretched y offset.
- **Do not "fix" a render-time draft adjustment into an effect** (the `MemoryTable` Row
  pattern, and the old slot editor's): an effect paints the stale draft for a frame and
  `react-hooks/set-state-in-effect` rejects it; a key-based remount would discard the success
  note.
- **Do not compare a cell's draft against the row object** — `revalidatePath` hands every row a
  fresh object per write; compare VALUES or you wipe untouched drafts.
- **Do not make an emptied cell delete its row** (memory or shortcuts) — refused and reverted on
  purpose; the one-click delete is nearby.
- **Do not make anything but the delete optimistic** in `MemoryTable`/`ShortcutTable`, and do
  not give `row.enabled`/a checkbox a draft — a refused toggle must never flash "on".
- **Do not put the `<colgroup>` back in either table.** A `<col>` maps by position among
  rendered cells; the widths live on the `<th>`s.
- **Do not add active-link highlighting anywhere but `AdminNavLinks.tsx`.** A `usePathname()`
  read costs a client boundary; it is paid once, in the smallest subtree that needs it.
  `AdminNav` stays directive-free (test-pinned).
- **Do not put words back in a phone nav cell.** The one-row icon bar is what icons bought; a
  new route widens to `grid-cols-7`, and if the row ever changes, `h-14` and the layout's
  `pb-[calc(5rem+var(--safe-bottom))]` move together (test-pinned).
- **Do not give the personality panel back a Save button, a `disabled={pending}` lock, or a
  keystroke debounce on the notes.** The auto-save model is load-bearing exactly where a
  "harmless" rollback breaks; the test forbids the substrings. Typing touches only the draft.
- **Do not bolt the text-model select into `CharacterPanel`.** Different row, store and blast
  radius; its own one-export action is test-pinned.
- **Do not re-grow the image-gen panel's staged-commit row, its focus-card hints, or a
  "revision" anywhere.** All purged; the auto-save pipeline and the additive-checkboxes copy are
  the current design.
- **Do not put the template guard in the browser.** The server refuses a broken template with a
  sentence; a client-side validator would be a second rule that can disagree, and the failure
  the feature exists to prevent is a broken PROMPT, not a refused edit.
- **Do not disable the panels' controls while a save is in flight.** The merge-after-save
  pattern protects edits made during flight; locking flickers the whole panel per round trip.
- **Do not import from `@/lib/nina/` in `ShortcutTable.tsx`.** The caps come through
  `@/lib/admin/shortcutModel` (test asserted); the next specifier copied from that directory is
  the one that reaches zod and `lib/db/schema.ts`.
- **Do not add a confirmation to the shortcut table**, and do not *spell* the forbidden dialog /
  second-click API names in that file's comments — the guard reads the source and cannot tell an
  explanation from a reintroduction.
- **The `MemoryTable` add-row suites flake under full-sweep parallel load.** A red there is not
  automatically your diff: reproduce on clean HEAD, then re-run with `--no-file-parallelism`
  before attributing.

## Notes

**Retired files, none of which should come back.** With the file manager: `AlbumManager.tsx`
(framing half moved verbatim into `SelectionPane`) and `UploadAvatar.tsx` (superseded by the
folder-aware queue). With the Chat-photos merge (`P1-RI-A035`): `ChatPhotoGrid`,
`ChatPhotoDetail`, `ChatPhotoControls`, `ChatPhotoAdd`, `ChatPhotoDescription`,
`ChatPhotoProfilePicture`, `chatPhotoModel.ts`, `chatPhotoUpload.ts` (re-homed into
`explorer/`) — and the `/admin/photos` route itself, so a second photos surface must not grow
back next to the Media view. With R3: `explorer/MediaDescription.tsx` (the marked interim seam;
its textarea idiom lives on in `PhotoDescription`). With the memory rebuild: `MemoryLedger.tsx`
and `MemorySlots.tsx` (replaced by the one `MemoryTable`; with them the retract, purge, retire,
record-as-fact and remove-promise actions and the typed purge confirmation).

**Seams:** three were marked in source for phases beyond the one that wrote them; all three are
closed (Phase 6 folder maintenance — taken by `FolderMenu`-on-`Row` rather than a nav-level
button; Phase 7 share — exactly the predicted one prop thread; Phase 3 describe — the wholesale
`PhotoDescription` replacement). `SelectionPane.tsx`'s `SEAM — PHASE 7` comment block remains
load-bearing for its explanation of the leading-`*` JSX comment style:
`ci:client-secret-guard`'s Rule 3 exempts only lines a comment scanner recognises (`//`, `/*`,
`*`), so a JSX comment with bare-prose continuation lines fails the guard while quoting the rule
it obeys.

**Measured database state (2026-09-12, read-only):** all 20 drizzle migrations are applied to
the one live database this repo has; `nina_avatars` holds 36 live rows the explorer and every
folder operation can touch; `nina_folders` holds 0 rows — folder maintenance has never had real
rows to work on, so its guarantees remain the ones typecheck, build and
`tests/admin.folderOps.test.ts` can give. Earlier versions of this readme claimed migration
`0003` was "applied to no live database"; that was a 2026-09-04 snapshot and is no longer true.

**Known, accepted limitations:** folder sort is lexicographic rather than natural; a tile can
repeat across two consecutive pages during an upload (nothing is ever skipped); empty
directories in a dropped tree cannot survive an upload (invisible to the browser); media rows
never get thumbnails (48/page originals); multi-select is not built (the actions are already
plural, so it is a client-only change when it comes); internal drag-to-move is not built (the
`<select>` is the gesture). The character panel has no live bubble preview — a sample reply is a
model call and Rule 2 puts that off a render; seeing a dial's effect means moving it and talking
to her.

## Documentation log

- **2026-09-04** — created via `/update-readme` after `admin-album-file-manager` phases 5–7:
  the explorer, folder maintenance, "Share link to Nina".
- **2026-09-05 → 09-07** — character tuning (`CharacterPanel`, `DialSlider`), the Personality
  route split, `/admin/shortcuts` (`ShortcutTable`, the nav's sixth cell, `UserPicker`'s
  `basePath`).
- **2026-09-09** — the revision purges (tuning + imageprefs), then the auto-save sets:
  `simplify-personality-settings` (notes on blur, dial debounce, status line, one action) and
  `admin-imagegen-simplify` phases 1–3 (auto-save pipeline, revision purge, focus-card hint
  purge).
- **2026-09-10** — icon-only toolbars and rails, one-row icon nav (`admin-bottom-bar-icons`),
  active-tab accent (`admin-bottom-bar-active-tab`), one-icon-row rails, the shortcuts on/off
  checkbox, the image-gen camera select and template.
- **2026-09-11** — the `image-collection` set: the Media view read path (p1), the Chat-photos
  merge purging `/admin/photos` (p2), the unified `PhotoDescription` + described photos into her
  context (p3), the "Image collection" rename + borderless reference grid (p4); the memory
  confidence pipeline removed.
- **2026-09-12** — this compaction: `/admin/memory` rewritten for the one-table rebuild
  (`MemoryLedger`/`MemorySlots` → `MemoryTable`, four actions, confidence column gone);
  `TextModelSelect` documented; the image-generation section rewritten for the editable
  template, model select and ✕ clears; the "no component tests" claim replaced with the
  27-suite colocated reality; the not-applied-migration note replaced with a measured database
  state; the header changelog and this log compressed from ~250 lines of duplicated narrative;
  every claim above re-verified against the tree at `7899385`.
