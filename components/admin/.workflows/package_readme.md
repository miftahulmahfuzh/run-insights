# Package: components/admin

**Location**: `components/admin`
**Last Updated**: 2026-09-11 (task `P1-CA-A005`, `image-collection` phase 3 of 4 — one describe control everywhere: `explorer/PhotoDescription.tsx` is the ONE describe panel and it mounts inside BOTH arms of `SelectionPane`'s dispatcher — the album closures in `AlbumSelectionPane`, the media ones in `MediaPane`, which lost its eye toggle, `showDescription` and its null-ness `<dl>` row, while the album pane lost its null-guarded describe button and its own null-ness row; `MediaDescription.tsx`, the seam Phase 2 marked, is deleted; the describe verb is always available, runs the vision model and OVERWRITES with no confirmation, its subject follows the photo through `describeSubjectForSide` (`lib/nina/album.ts`), and `lib/nina/gateway.ts`'s `readMessageWindow` stopped hardcoding `imageDescriptions: []`, so the conversation window's described photos reach every turn's context; previously 2026-09-11, task `P1-RI-A035`, `image-collection` phase 2 of 4 — the Chat-photos merge: the standalone `/admin/photos` surface is purged and its eight files with it, the media rail is re-hosted inside the explorer as `MediaPane`/`MediaAdd`/`MediaControls`/`MediaDescription` plus `explorer/chatPhotoUpload.ts`, `SelectionPane` became a two-arm dispatcher over the `isMediaRow` guard, every original `nina_message_images` row — generated AND hand-added — is now replaceable/describable/adoptable/downloadable from `/admin/nina`, the Chat-photos cell left `AdminNavLinks` (`grid-cols-7` -> `grid-cols-6`), and `MediaDescription` carries the set's marked Phase 3 seam; previously 2026-09-10, owner request, no task id — `/admin/shortcuts`' two-word on/off dropdown became a one-click checkbox in the table's FIRST column, `DialSlider`'s per-dial idiom whole, still non-optimistic, with a disabled checked box in the add row and a guard test keeping the dropdown from coming back; previously 2026-09-09, task `P1-RI-A031`, `admin-imagegen-simplify` phase 3 of 3 — the focus-card hint purge: each of the six "Focus on" cards is now its label and nothing else — the hint `<span>` under the checkbox is gone, and the card's single span still carries the "unsaved" marker; previously task `P1-RI-A029`, `admin-imagegen-simplify` phase 2 of 3 — the image-prefs revision purge: `ImageGenPanel` takes no `revision` prop and prints no "revision N" copy anywhere, and the column leaves `nina_image_prefs` in `drizzle/0017_retire_imageprefs_revision.sql` (committed, NOT applied — the post-deploy `npm run db:migrate`); previously task `P1-RI-A028`, phase 1 of the same set — `ImageGenPanel` adopted the Personality auto-save pipeline and its Save/Discard/Reset row went with the reset action; before that, task `P1-RI-A026`, `simplify-personality-settings` phase 2 of 2: `/admin/personality` went auto-save — `CharacterPanel` commits every control at the moment its edit is finished (dials debounced, toggles and radios on change, notes on blur), the Save / Discard / Reset row and the "N unsaved" counter are gone, and `lib/admin`'s tuning write side is down to one whole-row action; same day, task `P1-CA-A004`, `admin-bottom-bar-icons`: `AdminNav`'s phone bar went icon-only — one `grid-cols-7`/`h-14` row of seven inlined Lucide glyphs with sr-only `short` names, and `app/admin/layout.tsx`'s `<main>` reserve back to `5rem`; previously tasks `P1-CA-A003` and `P1-ADM-C410`, the `nina-image-generation-tab` set — `/admin/image-generation`: `ImageGenPanel`, `PhotoReferencePicker` + `photoReferenceModel`, `ImageGenTestPanel`, and `AdminNav`'s move to a seven-cell 4x2 bar)

## Overview

`components/admin` is the view layer of `/admin/**`: the file manager that `/admin/nina` became —
her album as a folder tree and grid, and, behind the same chrome, the Media view where every
photograph of the conversation lives — the framing studio that decides how her face sits in a
circle, and the panes behind `/admin/memory`. The standalone `/admin/photos` surface is gone; its
rail migrated into the explorer (task `P1-RI-A035`).
There is no data access, no validation and no vendor call in this directory. Reads arrive as props
from a Server Component; writes leave through a Server Action in `lib/admin`.

Most of it is `'use client'`, but **not all of it, and the exceptions are deliberate**. `AdminNav`,
`UserPicker` and `CircleFrame` carry no directive. `CircleFrame` holds no state and imports only
pure modules, so it renders on the server *and* compiles into the client graph of whichever client
component imports it. `UserPicker` could only need a directive for active-link highlighting, and
`usePathname()` would make it client-rendered to bold one word — so selection is expressed in the
URL instead, conveyed with `aria-current` and a `basePath` prop from callers that already know
their route.

`AdminNav` used to be named in that same rule, until the owner's own sentence ordered the phone
bar's active cell highlighted — *"pastikan kita menghighlight tab yang aktif dengan mewarnai icon
nya dengan warna biru (gunakan warna biru yang sama dengan text 'Manage the album')"*
(`admin-bottom-bar-active-tab`). What the ruling kept of the rule is its arithmetic: the nav did not
go wholly client. `AdminNav` is still a directive-free Server Component — the `<nav>` shell, the
eyebrow, the footer — and the one subtree that reads the route, the list row with the glyphs, is
`AdminNavLinks.tsx`, the shell's client leaf: `'use client'`, `usePathname()`, the active glyph
painted `text-accent` with `aria-current="page"` on its link. That leaf is still server-rendered
into the initial HTML of every route, so the bar works before hydration exactly as it did.

`touch.ts` and `photoIcons.tsx` fill out the directive-free set, for different reasons again:
`touch.ts` exports two class strings and nothing else, so it compiles into whichever graph imports
it — the Server Component `UserPicker` and the client component `DialSlider` both do — and
`photoIcons.tsx` is thirteen glyphs of inline SVG that are not worth a package, `aria-hidden`
decor whose accessible name lives on the control that draws it.

It is a **responsive admin surface** package with exactly one breakpoint, `lg` (64rem / 1024 px),
and that is still a deliberate exception to the rest of `components/`. It used to be desktop-only —
*"admin page (desktop usage)"* — and R1 of the admin-responsive plan set retired that premise: the
operator opens every one of these screens on an iPhone XS Max in Safari, so at 414 px the explorer
is one column with the folder rail behind a **Folders** button, the memory table drops two columns
and scrolls inside its own box, and the crop studio takes a pinch. At `lg` and above every screen
is the rails-and-canvas layout it always was, at the same widths.

There **is** a bottom bar below `lg`, and it is `AdminNav` — not `components/ui/TabBar.tsx`. The
distinction is worth a sentence because the two now look alike and are not: `TabBar` is the
runner's five-tab navigation inside `AppShell`'s 470 px column; `AdminNav` is this package's own
six-cell icon-only `fixed bottom-0 h-14 z-30 border-t` bar (seven until the Chat-photos cell left
with `/admin/photos`, 2026-09-11) — a Server Component shell over the
`AdminNavLinks` client leaf, whose active cell is painted `text-accent` since the owner asked for
it (`admin-bottom-bar-active-tab`). There is no `AppShell` and no 470 px column here. Tokens are
still borrowed from the app's design system rather than re-invented.

**Anything in this package that a thumb has to hit is at least 44 px on its smaller axis**, and
that number is spelled once, in `touch.ts`: `TOUCH_TARGET` (`min-h-11`) for a control that is
already a block or a flex line, `TOUCH_ICON` for a glyph that needs a 44 × 44 box built around it.
Every non-`Button` interactive control here uses one of those two. `Button` needs neither —
`size="md"` IS `h-11` (`components/ui/Button.tsx:42`, `h-11 px-4`), which is why
`ShareToNinaItem` needed no change at all when the rule landed, and why the migrated media controls
square themselves with `w-11 px-0` instead of leaving the box alone. When something in here looks
20 px, that is the bug, not the density.

The organising rule is **invariant 6, read as a boundary**: anything decidable is a pure function
in `lib/`, because vitest runs `environment: 'node'` with no jsdom. What is left here is what
cannot be proved in Node — `DataTransferItem`, `FileSystemDirectoryReader`, `OffscreenCanvas`,
`ResizeObserver`, `PointerEvent`, `FileList` — plus the JSX that arranges it. That is why this
package has no test files and why that is correct rather than a gap: the judgements its screens make
(is this an image, is this path legal, do we already have it, may this folder move there, where does
this crop land) all live in `lib/admin/filetree.ts`, `lib/admin/folderOps.ts`, `lib/admin/chatPhotos.ts`
— the Media view's pathname predicate and add-plan, zod-free like the rest — and `lib/nina/crop.ts`
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
- Serve the Media view — the conversation's photographs, her generated selfies and his composer
  uploads alike — with the full verb set the purged `/admin/photos` rail had: adopt as her profile
  picture under a draft framing, replace, remove, download, hand-edit the description or re-run
  the vision describe on it, read the
  generation prompt, and add new photographs on a carrier message.
- Own the framing studio and the sanity circles, at the sizes the chat actually draws.
- Hand a photo to her chat as a **pointer, in a new tab**, getting the order inside one click right:
  fire the describe, then open the tab, await neither before the other.
- Render `/admin/memory`'s ledger and slot editor.
- Render `description` as editable prose on BOTH arms, through the one `PhotoDescription` panel
  (R3). The admin surface is the deliberate exception to invariant 5, which still governs every
  runner-facing path untouched: her prompt's private input is corrected here by the one human
  allowed to, the old show-only-*whether*-it-exists null-ness `<dl>` rows are gone from both arms,
  and `MediaPane` still prints the generation prompt.

## Module map

| File | Kind | Purpose |
|---|---|---|
| `touch.ts` | **no directive** | The 44 px rule, spelled once: `TOUCH_TARGET` and `TOUCH_ICON`. Zero imports, no JSX. |
| `FileExplorer.tsx` | `'use client'` | The screen. Layout, toolbar, breadcrumb, drop target, the URL grammar — both arms of it (`hrefForFolder` and `hrefForMediaView`). The toolbar's buttons are **icon-only** (private inlined Lucide glyphs, `aria-label` is the name — 2026-09-10, so one row fits a 414 px screen); the details rail mounts for the selection — there is no toggle, tapping a photo opens it and its × hands the selection back. Below `lg` the toolbar is two rows and the folder rail is a drawer (`treeOpen`, `id="admin-folder-rail"`). `?view=media` swaps the content pane to the Media view inside the same chrome: the drop handlers stand down, `MediaAdd` replaces the two album Add buttons, and `PhotoMoveBar` and `UploadQueue` do not render. |
| `explorer/model.ts` | **types only**, no directive | The props contract between the Server Component and the explorer, and the row union: `ExplorerPhoto` is `AlbumExplorerPhoto \| MediaExplorerPhoto`, discriminated by `origin` (`'album'` = an `nina_avatars` row, `'media'` = an original `nina_message_images` row — `kind`, `side`, `prompt` and `messageId` live on that arm alone, whose `thumbUrl` is typed `null` so it cannot grow a thumbnail by accident and whose `isCurrent` is typed `false` because adoption copies the bytes into `nina_avatars` and it is the copy that carries `is_current`). No runtime export at all. |
| `explorer/dropWalk.ts` | browser APIs, no directive | `webkitGetAsEntry()` capture, the `readEntries` pump, the `webkitdirectory` picker. Decides nothing. |
| `explorer/thumbnail.ts` | browser APIs, no directive | One decode: intrinsic size out, 256 px JPEG out. |
| `explorer/useFolderUpload.ts` | `'use client'` hook | One gesture end to end: walk, diff, four-lane upload, chunked register. |
| `explorer/FolderTree.tsx` | `'use client'` | The folder rail. Every row is a `<Link>`, and every row is 44 px — including the pinned Media row, which is a link to a view and carries a count badge but no `…` menu. |
| `explorer/PhotoGrid.tsx` | `'use client'` | One folder's — or, on the media arm, the Media view's — page of square tiles, plus the pager. |
| `explorer/SelectionPane.tsx` | `'use client'` | The details rail, as a two-line dispatcher: an album row renders the private `AlbumSelectionPane` (framing, facts, action list, and since R3 the unified describe panel's album closures — otherwise unchanged), a media row renders `MediaPane`, narrowed by the `isMediaRow` guard. The dispatcher pre-narrows the arms, so neither arm reads the `origin` discriminant — which is what lets one `PhotoDescription` serve both with no branch. |
| `explorer/MediaPane.tsx` | `'use client'` | One Media row in full — the purged `/admin/photos` rail re-hosted, in the album pane's own idiom (one icon row, 44 px squares, `aria-label` is the name). The brush prints the generation prompt ONLY while `prompt != null` — no dim state — the person frame adopts as her profile picture under a DRAFT framing, the download rides `useSavePhoto`, and `MediaControls`' Replace / Remove drop into the same row. `prompt` is printed here; the description story lives in the `PhotoDescription` section below the icon row — the eye toggle, its `showDescription` state and the pane's null-ness `<dl>` row retired with the seam they fed. |
| `explorer/MediaAdd.tsx` | `'use client'` | The Media toolbar's "Add photos": browser JPEG encode -> dedupe pre-check -> PUT -> `addChatPhotoAction`, on a carrier message, sequential per file, no confirmation. |
| `explorer/MediaControls.tsx` | `'use client'` | Replace and Remove for one Media row, as a fragment dropped into `MediaPane`'s icon row. No confirmation; a successful remove's `note` goes UP to `FileExplorer`, because this pane unmounts under the revalidation that carries it. |
| `explorer/PhotoDescription.tsx` | `'use client'` | "What she can see in it" — THE one describe control, for every photograph on the page, album row or media row (R3). Stored prose rendered in full and editable by hand (the textarea idiom `ChatPhotoDescription` carried through the seam); a describe/re-describe button ALWAYS available that runs the vision model and OVERWRITES, no confirmation. It imports no server action — the host arm hands in `onSave` / `onRedescribe` closures over its own table's actions — which is what made `MediaDescription.tsx`'s replacement wholesale. |
| `explorer/chatPhotoUpload.ts` | `'use client'` | The encode-and-PUT path both Add and Replace share: decode once, 1024 px long edge, JPEG 0.90, hash the encode before the PUT, skip the PUT on a dedupe hit (Add only — never Replace). Re-homed from `components/admin/chatPhotoUpload.ts` beside `thumbnail.ts`, its cited precedent. |
| `explorer/UploadQueue.tsx` | `'use client'` | One honest line about what the upload is doing. |
| `FolderMenu.tsx` | `'use client'` | One folder's four verbs: New subfolder / Rename / Move to… / Delete. A `mode` union, four `absolute` panels. Decides nothing. |
| `PhotoMoveBar.tsx` | `'use client'` | Move or remove the current selection. Reads phase 5's `selectedId`, never writes it. `null` when nothing is selected. |
| `ShareToNinaItem.tsx` | `'use client'` | "Share link to Nina". Opens the chat in a new tab; fires the describe and never awaits it. |
| `CropStudio.tsx` | `'use client'` | Drag / pinch / wheel / slider / arrow keys. Multi-pointer: every contact is tracked by `pointerId`, one pans and two pinch. Contains one subtraction and one `Math.hypot`. |
| `CircleFrame.tsx` | **no directive** | A stored crop rendered as a circle at any size. Stateless, pure imports. |
| `photoIcons.tsx` | **no directive** | The shared inline SVG glyph set (plus, swap, trash, check, sparkles, brush, person-frame, download, rotate, …) — one home so one trash can cannot end up with two silhouettes. `aria-hidden` always; the accessible name is the control's `aria-label`. Born on the purged `/admin/photos` surface, kept by its successors. The eye glyph outlived its toggle (R3 took `MediaPane`'s eye with the describe seam) and is exported with no consumer today. |
| `AdminNav.tsx` | **no directive** | The `/admin` nav's shell: the `<nav>` element, the desktop eyebrow and footer paragraph, and the breakpoint mechanics — `fixed bottom-0` below `lg` with `pb-[calc(var(--safe-bottom)/2)]` (the home-indicator pad halved by the owner's order, `admin-bottom-bar-active-tab`), `lg:sticky lg:top-8` above it. The list itself — links, glyphs, sidebar labels — is `AdminNavLinks.tsx`, the one client leaf. |
| `AdminNavLinks.tsx` | `'use client'` | The nav's LIST, both renditions from one markup: `grid-cols-6` at `h-14` below `lg` — one row of six 56 px-tall icon cells, each a 24 px inlined Lucide glyph (`layout-dashboard` · `images` · `smile` · `wand-sparkles` · `brain` · `zap`) named by its sr-only `short` string — and the sticky text rail's long labels at `lg`. Six, not seven: the Chat-photos cell (the camera) left the bar with `/admin/photos` when that surface merged into the explorer (2026-09-11), and the row went `grid-cols-7` -> `grid-cols-6`. It exists because the owner ordered the active tab's icon highlighted in the album link's blue (*"mewarnai icon nya dengan warna biru yang sama dengan text 'Manage the album'"*): `usePathname()` finds the active cell, paints its glyph `text-accent` (scoped by the glyph's `lg:hidden`) and sets `aria-current="page"`. At `lg` the active cell fills the hover pill `bg-accent-soft` with a `text-ink` label — the owner's *"make the active tab highlighted… no difference between an active tab and the others"* (2026-09-10), the selected-tile vocabulary `PhotoGrid` uses — with explicit `lg:hover:` twins so the pointer cannot repaint it inactive. `px-[7px]` on the row is the owner's *"kurangi saja padding nya by 1px"* dial — one pixel off each glyph's side-air, cluster still centred; `app/admin/layout.tsx`'s `pb-[calc(5rem+var(--safe-bottom))]` is the paired reserve and `tests/admin.shell.test.ts` is what stops the two drifting. |
| `ShortcutTable.tsx` | `'use client'` | `/admin/shortcuts` — the trigger registry as one table. `MemoryTable`'s mechanics with different columns: blur-to-save cells, optimistic delete, no confirmation. |
| `ImageGenPanel.tsx` | `'use client'` | `/admin/image-generation` — the whole content of that route: the prompt-length `DialSlider`, six focus checkboxes, four free-text fields, the mounted photo-reference picker and test panel, and a **pure** prompt preview built by the real `buildNinaImagePrompt`. One `useTransition`, **one save for all eleven controls** (plan invariant 7) — since the `admin-imagegen-simplify` set it auto-saves on `CharacterPanel`'s pipeline (dials debounced, checkboxes and the reference on change, text on blur; no Save/Discard/Reset row), and the `revision` prop and "revision N" copy are gone with the column. |
| `PhotoReferencePicker.tsx` | `'use client'` | The reference grid: Nina's album and her chat photographs as one caption-less, gapless, square-tile collection in the iOS Photos idiom — no filename, no date, no set label on any tile. Single selection, `aria-pressed`, reveal-by-48, `loading="lazy"`. It cannot announce which set a tile came from, because `PhotoReferenceItem` carries no provenance field to announce. |
| `photoReferenceModel.ts` | **no directive** | The picker's view model: four constants, six pure rules, and `PhotoReferenceItem` pinned at exactly three fields — which is what makes "no captions, no dates" structural rather than a promise. |
| `ImageGenTestPanel.tsx` | `'use client'` | The test-prompt button and its verdict. Dispatches one generation off the **saved** prefs, returns without awaiting it, then polls: `queued` → `running` → `ok`/`failed`. `policy` is the only path that renders as *"the provider refused this prompt"*; `timeout` / `transport` / `stale` render as inconclusive. Shows the remaining daily quota before the click, and says *"one generation off today's cap, plus its caption"* because the caption is a second model call. |
| `MemoryLedger.tsx` | `'use client'` | `/admin/memory`'s fact ledger: insert, edit, retract, purge. |
| `MemorySlots.tsx` | `'use client'` | `/admin/memory`'s slot editor, plus the pending-promises panel. |
| `UserPicker.tsx` | **no directive** | Whose rows are being edited. Plain links, selection in the URL. `basePath` (optional, defaults to `/admin/memory`) says which per-user route the pills navigate within. |
| `CharacterPanel.tsx` | `'use client'` | `/admin/personality`'s character tuning — the whole content of that route: twelve trait sliders, the five-way relationship selector, the four extra dials, the notes field, and the assembled prompt preview. One `useTransition` and one action, and since the simplify set **no Save button**: the panel auto-saves, every control committing at the moment its edit is finished (dials debounced ~600 ms, toggles and radios on change, notes on blur). Always open; `id="character"` on the section root, so the old album-route `#character` bookmark still lands somewhere real. (A Wardrobe input sat beside Notes until F41 R3 moved it to `ImageGenPanel.tsx`.) |
| `DialSlider.tsx` | `'use client'` | The range primitive `components/ui` does not have. Label, hint, value, `0-100`, an unsaved dot, click-to-default, and an optional per-parameter on/off checkbox (`enabled` + `onEnabledChange`; omit both and no checkbox renders). Props unchanged by either panel's auto-save — the personality panel and, since the `admin-imagegen-simplify` set, `ImageGenPanel` share the primitive — and its per-dial "default *N*" chip is now the only route back to defaults on both, writing through `onChange` so the commit rides the same settle debounce as a drag. Decides nothing. |

## The `/admin/nina` file manager

### Three columns at `lg`, one column and a drawer below it

At `lg` and above this screen is what it always was: a 200 px folder rail, a `minmax(0,1fr)` canvas,
and a 320 px details rail when one is open. Below `lg` those become one column in DOM order — rail,
content, details — and the rail is a **drawer**: `FileExplorer` holds a `treeOpen` boolean, the
toolbar grows an icon-only drawer `Button` (Lucide `panel-left`, `lg:hidden`, named by a dynamic
`aria-label` since the buttons went icons-only on 2026-09-10 to hold one row at 414 px), and the
rail's wrapper carries `id="admin-folder-rail"` so `aria-controls` points at something real.

Three things about it are deliberate. It is **closed by default**, because the breadcrumb above
already answers "where am I" and the question a file manager gets asked at 414 px is "show me this
folder's photos". It is `lg:` **classes rather than a `matchMedia` hook**, so there is no breakpoint
to observe, nothing to hydrate against, and no first frame where the desktop layout is missing a
column. And the rail **stays in the DOM at every width** — hidden with `hidden lg:block`, not
unmounted — which is what keeps `FolderTree`'s expansion overrides and an open `FolderMenu` panel
alive across a toggle.

The toolbar itself is two rows below `lg` (crumbs over controls) and one flex line at `lg`, via
`lg:contents` on the control group: at `lg` the wrapper stops generating a box and its children
rejoin the toolbar's flex line in the same order.

### What lives in the URL and what lives in state

This screen holds both kinds of state at once, and the split is a rule rather than an
inconsistency:

- **`?view=` is in the URL too, for the same class of reason: it decides which TABLE the page
  reads.** `app/admin/nina/page.tsx` parses it once with `readExplorerView`
  (`lib/admin/filetree.ts`) and hands `view` down as a prop — the component never re-parses the
  parameter, for the same reason it never re-parses `?folder=` — and any value that is not `media`
  reads as the album, so a typo or a stale bookmark degrades to the screen the bare URL has always
  meant instead of an error page.
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

The URL grammar has one home in `FileExplorer.tsx`, and since the Media view it is a two-arm family
rather than one function: `hrefForFolder` spells `?folder=&page=`, `hrefForMediaView` spells
`?view=media&page=N` (the parameter's name and value come from `lib/admin/filetree.ts`, the same
module that parses them, so writer and reader cannot disagree), and `hrefForPage` branches on the
view so a media page 2 cannot silently drop the operator back into the album. The root folder is
the **absence** of `?folder=` and page 1 is the **absence** of `?page=`, so canonical `/admin/nina`
and navigated-back-to root are the same URL — and the same is true of `/admin/nina?view=media` on
the other arm.

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

The rail draws one row that is not a folder: **Media**, pinned under the album root. It is stated by
`mediaViewNode(count)` in `lib/admin/filetree.ts` and deliberately **not** a `FolderNode` — a
`FolderNode` has a `path`, and everything a path enables (`hrefForFolder`, `FolderMenu`'s four
verbs, a breadcrumb crumb) is exactly what a view must not have, so the node carries a
`view: 'media'` discriminant instead and no children to recurse into. A component that wanted to
treat it as a folder would have to write the cast itself. Its badge is `mediaCount` — the whole
collection, on BOTH views, because the album view pays one aggregate for a number its grid never
uses and a badge without a count is decoration. It is active when `view === 'media'`, and the
`view` half of that test is load-bearing: Media and the album root SHARE the path value `''`, so a
path-only test would highlight "Album" while Media's grid is on screen. Its href is `mediaHref`,
built by the grammar's other arm, and it renders no `…` menu — a view has no folder verbs.

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

It is view-aware in exactly three places, and none of them changes a tile: the toolbar's count line
reads "N in Media" rather than "N in this folder" (which would be a lie about a view), the empty
state says "Nothing in Media yet", and the page target follows `hrefForPage`'s branch. On the media
arm the `thumbUrl ?? url` fallback is not a degradation but the only path — a media row's `thumbUrl`
is typed `null` permanently (`nina_message_images` has no thumbnail column), which is why that arm
runs 48 tiles a page instead of the album's 120.

**`SelectionPane`** — the framing half is `AlbumManager`'s, moved and not rewritten: the same
`draft`/`stored`/`dirty` triple, the same `run()` transition helper, the same "Save framing" /
"Reset framing" pair through one action, the same two sanity circles at 44 px and 28 px. `CropStudio`
survived the move from a 460 px column into a 320 px rail without a line changing because it measures
its own frame with a `ResizeObserver`. Since the image-collection merge the export is a **two-line
dispatcher**: `isMediaRow(photo)` hands the row to `MediaPane` (its own section below), and anything
else renders the album pane — now a private `AlbumSelectionPane`, its content unchanged. That
pane's action surface is ONE `flex-wrap` icon row (2026-09-10, *"kalau tombol tombolnya bisa
dijejerin dalam satu row, maka jejerkan mereka dalam satu row saja"*): framing's two verbs left of
the hairline, then Set as her profile picture, `ShareToNinaItem`, the download — on
`useSavePhoto`'s shared ladder, the same machinery the chat viewer and `/nina/about` use, not a
third — and Remove last. The describe verb left that row with R3: it lives in the
`PhotoDescription` section below, next to the prose it rewrites. There is **no optimistic copy of
the album**: every action calls
`revalidatePath('/admin/nina')` and the page is `force-dynamic`, so there is nothing here to keep in
sync. `description` used to be shown only as *"Can talk about this photo"* / *"Cannot talk about
this photo yet"* — that null-ness `<dl>` row and the null-guarded "Describe it" button both went
with R3, and the pane now mounts `PhotoDescription` with the album closures
(`editNinaAvatarDescriptionAction` / `describeNinaAvatarAction`), rendering and editing the prose
itself. That is an admin-surface change only: invariant 5 still keeps the prose off every
runner-facing path, whose one image route remains the text block `userTurnText` renders.

**`UploadQueue`** — the sentence this component exists for is *"Nothing new. All 313 files are
already here."* "Upload only the new files" has a failure mode the requirement does not mention and
the operator hits on his second drop: **nothing happens**, which is indistinguishable from a broken
page. So `report.already` is on screen in words and numerals. One summary line by default; expanded,
every failure plus a bounded window of what is moving, and then an honest count of what it is not
drawing. `REFUSAL_TEXT` is an exhaustive `Record` over `UploadRefusal` rather than a `switch` with a
default, so adding a refusal reason in `lib/admin/filetree.ts` is a build error here until it has a
sentence.

### The Media view — the conversation's photographs, in the same chrome

`?view=media` is the screen's second arm, and it exists because the standalone `/admin/photos`
surface did: the operator was maintaining one collection of her photographs from a second route with
a second grid, a second rail and a second set of verbs, so the merge (task `P1-RI-A035`) deleted
that surface instead of growing it. What `/admin/photos` was, the Media view now is — **the same
chrome over a different table**: the tree, the breadcrumb, the pager and the details rail stay put,
and the rows come from `nina_message_images` (`listNinaMediaPhotos`, every ORIGINAL row — her
`'generated'` worker output and his `'upload'` composer attachments alike) instead of
`nina_avatars`.

**What stands down, and what replaces it.** The album's verbs are folder verbs and a view is not a
place rows are filed, so on this arm the drop handlers are not attached (a drag is absorbed only far
enough to stop the browser navigating away to open the dropped file), `MediaAdd` sits in the toolbar
in place of the two album Add buttons, `PhotoMoveBar` does not render (a media row's Remove is
carrier-aware and lives in its pane), and `UploadQueue` — a hook, so it cannot be conditional —
stays mounted and idle, never started. The breadcrumb grows a second crumb, `Album / Media`: the
Album crumb is the way back, and the Media crumb is appended in the JSX rather than faked into
`folderBreadcrumbs`' shape, because a fake path in the type would be a lie the breadcrumb then had
to special-case. A folder operation fired while Media is open lands on the folder's ALBUM view —
the only place its rows can be drawn.

**`MediaPane` — the purged rail, re-hosted.** One Media row in full, in the album pane's own idiom
(one icon row, 44 px squares, `aria-label` is the name), with `description` and `prompt` PRINTED —
the one arm where reading them is the point. Four things about it are why it is its own component
and not a branch inside the album pane:

- **The framing half is adoption, and the draft has nowhere to persist.** `nina_message_images` has
  no crop columns, so there is nothing for a "Save framing" to write to. `CropStudio` and the two
  sanity circles render a DRAFT crop that starts at identity and resets to identity, and the
  draft's ONE consumer is `setChatPhotoAsAvatarAction`, which receives `scale`/`x`/`y` at click
  time and copies the bytes into a fresh `avatar-` object. The `worn` latch disables the button
  once the action answered `ok` — a live button under a face she already wears would be a lie; a
  second click would not duplicate anything (the source-key lookup sees to that), but the operator
  should not have to know that.
- **The prompt affordance exists only while the sidecar does.** The old rail's brush toggle ALWAYS
  rendered and dimmed on `prompt == null` — the defect the owner named: *"kalo user udah replace
  satu photo, ... hapus tombol untuk ngeliat promptnya"*. Here the toggle is INSIDE the
  `photo.prompt != null` conditional: a replaced row (the update nulls `prompt` in the same
  statement as the bytes) and a hand-added row (`prompt: null`) show NO prompt affordance at all —
  no dim button, no empty block. There is no dim state for prompt and no replaced-flag; the
  column's NULL is the state, and `tests/admin.mediaPane.test.ts` reads the source to keep it that
  way.
- **Orphans are first-class members.** `messageId` is nullable with `ON DELETE SET NULL`, so
  deleting a chat session orphaned its photographs instead of destroying them, and this folder is
  where they live now. An orphan has no bubble to caption and no carrier to remove — the remove
  action takes its plain-row branch — and nothing here treats `messageId` as "broken". It is
  displayed nowhere.
- **The row has no filename, and none is invented for the pane.** The grid tile derives a display
  name from the row's date and id; the pane header prints the timestamp, because the pane answers
  "when" and the tile's `aria-label` already answers "which". The stored `pathname` is displayed
  nowhere and parsed nowhere.

The dispatcher keys `MediaPane` by `photo.id`, so **remounting is the reset**: selecting a different
tile closes the toggles, resets the draft to identity, and resets the `worn` latch and the
description box's unsaved marker with the selection — the old grid's documented idiom, carried
forward.

**`MediaControls` — Replace and Remove, no confirmation.** The owner's own sentence rules this
surface: *"i am the only one using this app, no need for all these bullshit confirmation"*. Remove
calls the action on click; Replace opens the file picker and uploads on `change`; the `busy` state
exists only to stop a double-click firing two uploads, which is a different thing from a
confirmation. Both verbs work on BOTH kinds of row — the kind refusal the old actions carried is
lifted with the merge — while the reference refusal is not: a row that re-shows a photograph living
elsewhere answers with its exact sentence, inline. And **the removal `note` goes up, not down**: a
removed photograph whose Blob object is still referenced by another row keeps its bytes in the
store, and the action says so — but this pane unmounts the instant the revalidation arrives without
the removed row, so a note rendered HERE would be destroyed before it could be read.
`onRemoved(note)` hands it to `FileExplorer`, which does not unmount, and it renders under the
toolbar until the next removal replaces it.

**`PhotoDescription` — the one describe control, on both arms.** R3's whole point: one component
serves every photograph on the page, album row or media row, and the host arm picks the actions.
It **imports no server action**: `onSave` and `onRedescribe` arrive as closures from
`AlbumSelectionPane` (`editNinaAvatarDescriptionAction` / `describeNinaAvatarAction`) or from
`MediaPane` (`editChatPhotoDescriptionAction` / `describeChatPhotoAction`), each of which already
knows its table because Phase 2's dispatcher narrowed it — so a rename in either action family
fails at the call site in that arm instead of silently inside a component that guessed. The
interaction is `ChatPhotoDescription`'s idiom, carried through the seam this component replaced:

- **The prose is editable by hand, and it is a SAVE button, not commit-on-blur.** The
  no-confirmation ruling is about a SECOND click on something, and this is the FIRST click of the
  write; a stray blur must not silently store a half-finished sentence into her prompt.
- **The describe button is ALWAYS rendered.** The null guard the panes used to put around the verb
  was the defect R3 exists to remove — a described photo with wrong prose had no way to re-run the
  eyes. It OVERWRITES, machine- or hand-written prose alike, and the accessible name says so once
  the row has prose (*"Re-describe it — it overwrites"*); there is no confirmation, because the
  hand-edit box above is the correction path. An emptied box is a CLEAR — the save button's
  accessible name flips to *"Clear the description"* so that write names itself too.
- **`draft === null` means untouched, which is why there is no effect.** The box shows the
  server's prose until the operator types, and once he has typed, nothing from the server can
  overwrite him — which is what makes a re-describe safe to fire under unsaved text: the fresh
  prose arrives in the `revalidatePath` payload and is simply not shown while his draft stands.
  After a successful SAVE the draft drops to `null` so the saved text reads as saved; after a
  DESCRIBE it is deliberately left alone.
- **One flight at a time.** A save and a describe running concurrently would interleave two writes
  to one column with no meaning attached to the winner, so while either is in flight the other is
  disabled. The textarea is disabled during a SAVE — the value being written must not change under
  the write — and left ENABLED during a DESCRIBE: an 8–11 s vendor call must not lock him out of
  typing.
- **The empty state is worded by the host, and only the host can.** `emptyNote` is the honest
  sentence about a row that is ABOUT to be fine — the album arm says the prose fills in once the
  photo is hers; the media arm says reload in a moment if it was just added or replaced, because
  after an Add or a Replace the field is NULL for the few seconds the `after()` caption pass takes,
  and *"reload in a moment"* beats an empty field that reads as a permanent defect.

The font size stays `CONTROL_CLASS`'s `text-base` — the Safari 16 px rule — with the character
count and the `unsaved` marker beside the buttons. The describe subject follows the photo: the
album's every row is hers, and `describeChatPhotoAction` picks through `describeSubjectForSide`
(`lib/nina/album.ts`) — hers gets the self prompt, his the runner prompt — so neither arm ever
points the runner prompt at her face. The keyed remount per selection resets the draft, which is
what keeps one tile's unsaved text out of the next tile's box.

**`MediaAdd` — "Add photos", on a carrier message.** *"add a new photo (so it is like nina
generated them, but actually it is manually added by user)."* Every row this flow creates hangs off
a carrier message `addChatPhotoAction` mints, because "add a photo" is still "add a message with a
photo on it" — a NULL `message_id` is the residue of a DELETE, never something a writer asks for,
and a photograph the operator adds on purpose has never been in a conversation. The multi-file pick
is a sequential `for` loop, not `Promise.all` (Server Actions dispatch one at a time per client),
the button's `loading` dots are the whole progress display, and a per-file failure is not a batch
failure: the loop records the message and continues, so one bad frame does not lose the rest.

**`explorer/chatPhotoUpload.ts` — the encode both flows share.** Re-homed from
`components/admin/chatPhotoUpload.ts` to sit beside `thumbnail.ts`, its own cited precedent for a
client encode module. Decode once, scale to 1024 px on the LONG edge (`NINA_IMAGE_HEIGHT`, so a
hand-added photograph lands in the same size class as every generated one rather than being the
only 4000 px object in the folder), JPEG at 0.90 — higher than the runner composer's 0.75, because
this is a photograph the operator chose deliberately and will look at full-screen —
`bitmap.close()` in a `finally`, and the canvas painted white before the draw so a PNG's alpha
channel cannot flatten to a black halo behind the JPEG encoder. The pathname is bound here
(`adminChatPhotoPathname`, the only producer of the shape) and parsed nowhere. The dedupe hash is
over the ENCODED blob before the PUT — the exact bytes the object will hold — and, for a
re-uploaded download whose re-encode produces bytes nobody has ever stored, over the picked file
too; both keys go into the one lookup. **Dedupe is opt-in, and Add is its only caller**: Replace
must never pass it, because its contract is "swap the bytes behind THIS row" and a deduped replace
would point the row at another row's object and strip its provenance to a reference — which the
collection reads then hide, making the photograph the operator can see vanish from the folder.

**No thumbnails, on purpose.** `nina_message_images` has no thumbnail column, so a media row's
`thumbUrl` is typed `null` — permanently, not as a migration path — and the grid loads originals at
`NINA_CHAT_PHOTO_PAGE_SIZE = 48` a page, `loading="lazy"` carrying what it can. The facts `<dl>`
says so in words — *"None — the grid loads the original"* — rather than leaving an operator to
discover it in his byte budget.

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
chevron, a `<Link>` and a count — so **every panel is an `absolute` overlay** beneath it: `z-40`,
280 px wide (capped at `calc(100vw-2rem)`), `shadow-sheet`. A panel laid out as a fourth flex *item*
would squeeze the other three and then wrap a text field into ~60 px. **The `z-40` is not
decorative and must not be tidied down**: below `lg` the shell's `AdminNav` is `fixed bottom-0` at
`z-30`, and a panel opened from the last row of the rail extends past that line — at `z-20` its
Delete and Move rows painted underneath the bar and could not be tapped. The overlay is a layout necessity of the seam phase 5 left,
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

**`PhotoMoveBar` reads phase 5's selection and never writes it, and it renders on the album arm
only** — a media row's Remove is carrier-aware and lives in `MediaPane`. `selectedId` arrives as a
prop,
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
  and the pane's `PhotoDescription` describe button is the retry.
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
re-describes unconditionally (it is `PhotoDescription`'s always-available re-describe), while `ensure…` returns after one
indexed single-row read for any photo that already has a description. So the common case costs a
read, the `described` guard skips even that, and only a never-promoted never-shared photo pays the
8–11 s. It sends **nothing** — `attachNinaPhotoToChat` would send immediately and await the whole
13–16 s turn, which is the wrong order for R2's *"user can input additional text question / comment
(optional)"*. This component arms the composer; phase 3 owns everything that happens in the new tab.

The URL itself is not built here. `ninaPhotoShareUrl` lives in `lib/admin/shareToNina.ts` — a pure
function, and therefore testable, per the boundary rule this package is organised around.

## The framing studio

**It is multi-pointer, and that is what makes it work on a phone.** Every contact is tracked in a
`Map` keyed by `pointerId`: one pointer pans, two pinch, and lifting either one ends the pinch
rather than quietly re-pairing with whatever is still down. The single `last` ref this component
used to hold had a real bug in it — a second `pointerdown` overwrote the id, so landing a thumb
mid-drag and lifting it again stranded the first finger and the photograph froze under it.

The pinch does not move the arithmetic budget: it is one `Math.hypot` over one pointer subtraction,
and the RATIO of this frame's span to the last is handed to `zoomCrop` unchanged — the same shape of
factor `zoomFactorForWheel` produces. Every clamp, bound and re-centring still lives in
`lib/nina/crop.ts`, which this work did not touch.

`select-none` and `[-webkit-touch-callout:none]` on the frame are not cosmetic either: without them
a press-and-hold over the photograph raises iOS's Copy / Share callout mid-drag, and a drag that
ends in a system sheet is a drag the operator cannot finish. `draggable={false}` only ever answered
the desktop half of that.

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
a touch drag pans instead of scrolling — and so Safari cannot claim a two-finger gesture as a page
pinch before the second pointer arrives. Pinch-to-zoom **is** implemented; see the multi-pointer
model above.

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

## The character panel

`/admin/nina` used to be two screens stacked on one route, and the order was deliberate: the album
is the working surface — the previous plan set built it for *"hundreds of profile pics"* — so
`CharacterPanel` rendered **above** the explorer and **collapsed**, as a summary line the operator
opened when they wanted to change who she is rather than what she looks like.

That premise was repealed by the person it was written for: *"right now, 'Her character' is in
Nina's album. move it as a new tab with name: Personality."* The panel is now the whole of
`/admin/personality` and the album is the whole of `/admin/nina`. Two consequences worth writing
down, because both look like details and neither is:

- **The disclosure is gone, not defaulted open.** `open` was never a prop — passing it would make
  React control the attribute and fight the operator's click, and `revalidatePath` re-renders this
  component after every save. So the root is a plain `<section>`, and what the `<summary>` used to
  hold is now the section header: relationship · loudest dials · *N* off, the same
  one-line answer to "what is she set to" that the hub card gives.
- **`id="character"` stayed on that section root.** It was a live deep link from the overview card
  for two plan sets. The card points at the route now, and the id costs one attribute and keeps a
  kept bookmark from landing on nothing.

### One save, not sixteen — and now it is literally one

There are close to forty controls on this panel — R4 put an on/off checkbox beside every one of the
sixteen parameters — and exactly one Server Action behind all of them. That is not tidiness, it is a
platform constraint: **Server Actions dispatch one at a time per client**, so sixteen sliders each
firing their own save would queue sixteen round trips and the panel would appear to hang on a drag,
and the toggles are in the same boat for the same reason. The simplify set made the count exact:
`resetNinaTuningAction` and `ninaTuningResetSchema` are deleted (`lib/admin/tuningActions.ts` and
`lib/admin/schema.ts`), `tests/admin.tuning.test.ts` asserts the one-export count, and every control
the panel has dispatches `saveNinaTuningAction`.

Every dispatch carries the whole tuning — scores, relationship, `enabled` map and notes, one object
held in `useState` and posted whole, comfortably inside the 1 MB body cap `next.config.ts` leaves at
its default. That, plus two facts about this screen, is what makes committing on every edit safe
rather than reckless: `nina_tuning` is one row per account, upserted on `user_id`, so there is no
history to fork; and the admin surface is one operator, so there is no second editor's in-flight
draft to overwrite. Sequential dispatch means commits cannot interleave out of order even when
several queue up, and a whole-row upsert is idempotent — so the failure mode of auto-save here is a
wasted round trip, never a half-written character. Two dials dragged inside the settle window
coalesce into one write; an immediate commit carries any dial still waiting; and a debounce that
matures while a save is in flight queues behind it and re-sends the whole draft.

### Every control commits itself

The commit moments are `components/admin/MemoryTable.tsx`'s rule, taken control-kind by
control-kind — and the slider is the one that needed a new answer:

- **The notes commit on BLUR.** A keystroke debounce would queue actions AND queue `revalidatePath`
  re-renders, and the operator's cursor would spend the session fighting them. Blur is exactly one
  write per completed edit, at the moment the edit is finished; typing touches only the draft,
  which is what makes "no Save button" true rather than cosmetic.
- **The relationship radios and every toggle commit on CHANGE.** A discrete control's change IS the
  finished edit — there is no "still dragging" state to wait out.
- **The dials commit DEBOUNCED**, `TUNING_DIAL_COMMIT_DEBOUNCE_MS` (600 ms, declared in
  `lib/admin/tuningModel.ts` beside every other bound this package imports rather than re-declares)
  after the last change. A native `<input type="range">` fires `change` on every pointer move and
  KEEPS FOCUS after the thumb is released, so the notes' moment — blur — does not exist for a
  slider. The debounce is the settle detector: one continuous drag becomes one save, and the timer
  is cleared on re-arm, whenever an immediate commit has already carried everything pending, and on
  unmount. **Cleared, not flushed** — an edit the timer never fired for was never committed, exactly
  as an unclicked Save was never committed in the staged-commit panel this file replaced.

Disarming before an immediate dispatch is not an optimization: the immediate commit carries the
WHOLE draft, so clearing the timer is what makes "nothing pending is lost and nothing is
double-sent" true rather than lucky. And both paths skip the dispatch when the draft equals the
saved row — the debounce re-checks at fire time through a ref mirror of the live draft and saved
row, because a timer callback runs outside render.

Three consequences worth writing down, because all three look like details:

- **`saved` is the panel's own state, and nothing syncs it from the prop.** It starts as the
  `tuning` prop and is updated ONLY from the action's result, which carries the row after
  `coerceNinaTuning` and the re-rendered route in one round trip. Nothing else writes this row (one
  operator), so the only way it changes under the panel is the panel's own save coming back —
  reading the row off the result is the same freshness as reading it off a re-render, without
  having to tell "my save landed" apart from "the row changed under me".
- **The draft does not blindly adopt the canonical row.** `coerceNinaNotes` trims and collapses, so
  the stored row can differ cosmetically from what was typed, and the operator may have kept editing
  while the save was in flight. `mergeTuningAfterSave(current, sent, canonical)` adopts the stored
  value only for fields still equal to what was dispatched; a field edited since keeps the newer
  local value and stays pending, riding the next commit. It is the same per-field comparison
  `changedTuningFields` makes, which is why the merge and the pending dots always agree.
- **Nothing is disabled while a save is in flight.** The staged-commit panel locked every control on
  `pending`; locking on every debounce settle would flicker the whole panel uneditable for the
  length of a round trip, and editing during a save is safe here — the merge above protects
  anything typed after dispatch, and the next commit carries the newest whole draft. `pending`
  drives only the status line.

The honest cost: a commit carries the notes as they stand, so an unfinished sentence can spend a
moment as the stored row if a dial settles mid-edit. The alternative — sending a stale notes value
to "protect" it — would write an older draft over the operator's newer words, which is the one
failure this pipeline exists to prevent.

### The status line where the counter was

The "N unsaved" counter is now a tri-state status line in the section header, `aria-live="polite"`
because it is the one line that changes on its own and "Saved" is worth hearing without stealing
focus. **Saving…** covers both halves of the pending window — a commit in flight and a settle timer
armed; React batches the timer firing with the transition opening, so there is no gap where neither
shows. **Saved** is the success surface, with no qualifier. **Unsaved edits** is what shows while
the operator types — a keystroke commits nothing, that is the rule — and after a failed save, whose
sentence renders once as a red paragraph at the foot of the panel. The per-row unsaved dot survives
with its old shape and a new baseline: `rowPending` still folds a row's two unsaved paths — its
score and its toggle — into the single existing mark, because two identical marks on one row is an
operator wondering which meant what, but it now measures the draft against the panel's live `saved`
rather than against a prop that only moves on a re-render. The header still carries the `N off`
count, since the number of excluded parameters is the one setting that cannot be inferred from the
numbers beneath it, and both checkbox kinds still carry the 44 px rule: `DialSlider` wraps its box
in `TOUCH_ICON`, and the relationship legend's label in `TOUCH_TARGET`, so a bare 16 px control
never becomes the exception to it.

A checkbox edits `draft.enabled[key]` and nothing else; **switching a parameter off never clears the
number it is parked at**, which is the point of a toggle as opposed to dragging the slider back to
the default — the operator parks `flirty` at 80, excludes it from tonight's prompt, and gets the 80
back with one click.

### Where "back to defaults" lives now

The reset-to-defaults control is gone, and with it the second action this section used to justify.
What survives is `DialSlider`'s per-dial "default *N*" chip, and it is a draft edit like any other:
it writes the default through `onChange`, so the commit rides the same settle debounce as a drag.
The defaults themselves still come from the server — the `defaults` prop is `NINA_TUNING_DEFAULTS`
mapped by the page, because the defaults are defined in `lib/nina/tuning.ts` and a client that
re-implemented them would be a second definition that one day disagrees. The header's "every dial
at its default" line is the whole-panel answer to the same question.

### Why the slider is a new primitive rather than a `NumberInput`

`components/ui/index.ts` has `Input`, `NumberInput` and `CONTROL_CLASS` and **no range control** —
this panel is the first screen in the app that wants one. A trait is a coarse feel rather than a
figure ("how angry, roughly"), and a number field asks the operator to type `73` when what they mean
is "quite". The primitive stays in `components/admin` rather than graduating to `components/ui`
until a second screen needs it, which is this package's standing rule about premature promotion.

### Where the labels come from, and why there is no second copy of them

Every slider's label and hint, every relationship's label, and every word she calls him come from
`lib/nina/tuning.ts` — `NINA_TRAIT_SPECS[key].label` / `.axis` / `.userSaid`,
`NINA_DIAL_SPECS[key].label` / `.axis`, and `NINA_ADDRESS[rel].label` / `.words`. The panel is a
renderer, and it does not read them directly: `lib/admin/tuningModel.ts` is the client-safe adapter
that turns them into `TuningCopy`, because a Server Component cannot read a plain export out of a
`'use client'` module and both `/admin/personality` and `/admin` need the same vocabulary. A local
table of labels would drift invisibly: the hint would promise one behaviour while the prompt produced
another, nothing would fail, and the operator would report the wrong bug. The only copy this
package owns is one sentence per relationship about what choosing it changes *about the app*, which
has no counterpart in `tuning.ts` and so cannot contradict it.

### The prompt preview is a string prop, and that is invariant 5

The panel shows the operator the system prompt her SAVED settings assemble to. It arrives as a
**plain string prop** from `app/admin/personality/page.tsx`, which calls the pure assembler, and it
trails the draft by design: while the panel holds edits the row does not, the `<summary>` says so —
*"(as saved — the edits above are not in it yet)"* — and every commit's `revalidatePath` hands the
page a fresh assembly in the same response that carried the save. It is
never fetched, never streamed and never the result of a model call: `scripts/check-llm-payload-boundary.mjs`
Rule 2 forbids awaiting a model call from a page render, by function name, and a preview that called
one would fail the build. The pure-function-versus-model-call distinction is the whole reason phase 3
kept `buildNinaSystemPrompt` free of I/O.

### What this panel does NOT do

It does not write memory. The tuning is deliberately **not** a memory slot: every slot value goes
into her prompt and the distiller may overwrite anything not marked `source: 'admin'`, so a tuning
in a slot is a character she could eventually rewrite about herself. It lives in its own table, and
`/admin/memory` is untouched by it.

## `/admin/memory`

### The table on a phone: 16 px controls, and two columns that are not there

Two facts about `MemoryTable` below `lg`, both of which a reader comes looking for after being
surprised:

- **`CELL_CONTROL` is `text-base` below `lg`, and this is the iOS rule beating the design.** Safari
  zooms the viewport when a control smaller than 16 px takes focus, which is why `app/globals.css`
  sets `font-size: max(16px, 1rem)` on `input`, `select` and `textarea` in `@layer base`. A Tailwind
  utility sits in `@layer utilities` and **beats that outright**, so the `text-[13px]` this constant
  used to carry re-opened the exact hole the global rule exists to close, on the one page in
  `/admin` that is nothing but form controls: every cell zoomed the page on focus and left it
  zoomed. 13 px density returns at `lg`, where there is no viewport to zoom.
- **Origin and When are hidden below `lg`** (`CELL_WIDE_ONLY` / `HEAD_CELL_WIDE_ONLY`, both
  `hidden lg:table-cell`). Six columns need 940 px; the four that stay are what it is, what it says,
  how confident, and delete. **The `<colgroup>` had to go for this to be safe** — a `<col>` maps to a
  column by POSITION among the cells actually rendered, so hiding two `<td>`s would have slid the
  delete cell into column 4 and given it Origin's 250 px. The widths now live on the `<th>`s, which
  carry them whether the cell is hidden or not. Do not put the `<colgroup>` back.

The table already scrolled inside its own `overflow-x-auto` box rather than scrolling the page, and
still does; `overscroll-x-contain` was added so that flicking it past its edge does not hand the
remaining scroll to the page, where a horizontal overscroll at the left edge is Safari's back-swipe.

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

## `/admin/shortcuts`

`ShortcutTable` is the whole content of the route, mounted by `app/admin/shortcuts/page.tsx` under a
`UserPicker` with `basePath="/admin/shortcuts"`. It is **`MemoryTable.tsx` with different columns**,
and that is deliberate rather than lazy: the two pages are operated in the same session by the same
thumb, and a second set of table mechanics would be a second set of ways to lose an edit.
`CELL_CONTROL`, `CELL`, `CELL_WIDE_ONLY`, `HEAD_CELL` and `HEAD_CELL_WIDE_ONLY` are that file's
tokens verbatim — `text-base` below `lg` for the iOS 16 px rule, `min-h-11` for the 44 px target,
13 px density back at `lg` — and the `overflow-x-auto overscroll-x-contain` box is its box.

Six columns: **✓ · trigger · label · expansion · fired · ✕**. The first is the on/off checkbox, and
it leads the row on purpose (2026-09-10): the two-word on/off dropdown it replaced cost two clicks —
open the picker, then pick — where a checkbox is the toggle in one, and the thumb meets it before
anything it switches. It is `DialSlider`'s per-dial checkbox whole: a `TOUCH_ICON` `<label>` makes
the 44 px box the hit target, the glyph is `size-4 accent-accent`, and the accessible name is the
label's `sr-only` span. `Fired` is the only one that goes
below `lg` (`hidden lg:table-cell`), and the reason is `MemoryTable`'s own for dropping Origin and
When: five of the six are things the operator *acts* on, while `Fired` is telemetry he *reads* — a
count and a date, both answers to "is this code dead?", which is a question asked at a desk. It is
done with table-cell utilities and **not a `<col>`**, for the reason already written down under
`/admin/memory`: a `<col>` maps to a column by position among the cells actually rendered, so hiding
a `<td>` slides every later column into the wrong one. The widths live on the `<th>`s.

**The add row is a row of the table, at the top**, not a card above it — the table is newest-first,
so the row just created appears directly under the form that made it. `Enter` commits from either
single-line cell; the expansion is a `<textarea>` (up to 2000 characters of scene, with paragraphs
in it) so `Enter` there means newline and `Cmd`/`Ctrl+Enter` is the chord. That is the **first**
click of a create, not a second click on anything.

**Blur saves, one field at a time.** Each of the three text cells holds a draft that follows its
prop *adjusted during render* — `MemorySlots`'s pattern and the same reason it is not an effect —
and the comparison is against the VALUE, never the row object: `revalidatePath` hands every row a
fresh object on every write, so comparing identity would wipe a draft in a cell nobody had touched
each time any other cell saved. `Escape` reverts a cell, `Cmd`/`Ctrl+Enter` commits without leaving
it, and an emptied cell is **refused rather than treated as a delete** — a stray select-all-and-tab
would otherwise destroy a shortcut silently, and the one-click delete is three columns away.

**Only the delete is optimistic**, exactly as on `/admin/memory`. `useOptimistic` here is a plain
filter rather than the ledger's blank-row substitute, because a shortcut has no closed vocabulary:
the row is gone and nothing manufactures it again. `row.enabled` deliberately has **no draft** — the
checkbox renders the prop and the server's answer is what changes it, so a refused toggle never
flashes "on". It saves on **change**, because a checkbox's change IS the finished edit — and since
2026-09-10 that change is one click, the checkbox leading the row, where the two-word on/off
dropdown it replaced wanted two.

**There is no confirmation anywhere.** The `✕` deletes on the first click. Invariant 6 and the
owner's own sentence, and `tests/admin.shortcuts.test.ts` asserts the absence of every dialog and
second-click API *by name* — which is why the component's docstring is careful never to spell those
names while explaining them, the same trap `tests/admin.shell.test.ts`'s `classNames()` helper
exists for.

**This file names no `@/lib/nina/` specifier at all**, and a test asserts it. The three `maxLength`
caps come through `@/lib/admin/shortcutModel`, which re-exports them from the pure matcher module;
that module's header carries the argument for the indirection, and the short version is that the
boundary should be one file wide rather than resting on a property of a file in another directory
that a `'use client'` component now names.

The trigger cell is just the field. The two read-only lines that used to sit under it are both gone,
removed on 2026-09-09 at the owner's request so a row stays one line on a phone: `describeKind`'s
kind explainer, which wrapped the table's narrowest column into five lines, and the folded
`matchKey`, which duplicated the trigger the operator had just typed. `matchKey` and `kind` are
still carried on every row and rendered nowhere.

### `AdminNav`'s sixth cell, and `UserPicker`'s one new prop

`AdminNav` gained `{ href: '/admin/shortcuts', label: 'Shortcuts', short: 'Shortcut' }` **last** in
`LINKS` — newest surface, and adjacent to Memory because that is the page it grew out of — and went
`grid-cols-5` -> `grid-cols-6` at the same `h-14`. More cells make the row narrower per cell, not
shorter, which is why the height did not move for the fifth cell either. The 8-character `short`
ceiling in `tests/admin.shell.test.ts` was **not loosened**: 414 px over six cells is 69 px, a
61 px content box, and eight characters of Poppins semibold at 11 px measure ≈ 51 px. `Shortcut` is
the singular on purpose — the plural is nine characters — and it is the only pair here whose two
strings differ by grammatical number rather than by word. The "a seventh route is 59 px a cell and
does not fit eight characters" arithmetic held until `admin-bottom-bar-icons` took the words off
the bar: the seventh route landed as a 24 px glyph in that 59 px cell, the ceiling retired with the
text it measured, and `short` became the sr-only accessible name each glyph carries. (The bar is
back to six cells since 2026-09-11 — the Chat-photos route merged into `/admin/nina` and its cell
left — so `Shortcuts` is the last cell again, and a genuinely new route would be the seventh.)

`UserPicker` gained exactly one optional, defaulted prop, `basePath = '/admin/memory'`, and no
existing call site was edited. It is a prop and not a `usePathname()` read for the rule this package
already carries: going client to fix an href is the same trade as going client to bold a word, for
less. The counts in each pill stay MEMORY counts — `AdminUserRow` is `lib/admin/users.ts`'s shape,
and on `/admin/shortcuts` "N slots · N facts" is still a true statement about the account, just not
about this page; a shortcut count would mean widening `listAdminUsers` and `getAdminUser`, which
belong to `/admin/memory`.

## Dependencies

### External

- `next/link`, `next/navigation` — `<Link>` for folder and page navigation; `useRouter().refresh()`
  once per finished gesture.
- `@vercel/blob/client` — `upload()`, which mints a token against
  `/api/admin/nina/upload` and PUTs directly to Blob.
- `react` — `useState`, `useEffect`, `useRef`, `useCallback`, `useMemo`, `useTransition`.

### Internal

- `@/lib/admin/filetree` — the folder-path grammar and the upload diff: `planFolderUpload`,
  `buildTree`, `folderAncestors`, `folderBreadcrumbs`, `folderName`, `folderParent`,
  `isInFolderTree`, and the `LocalFileLike` / `UploadRefusal` / `FolderNode` / `PlannedUpload`
  types. Since the Media view it also carries that arm's grammar: `NINA_MEDIA_VIEW_PARAM` /
  `NINA_MEDIA_VIEW_VALUE` with `readExplorerView` — the parameter's writer and reader in one
  module — plus `NINA_MEDIA_NODE_LABEL` and `mediaViewNode`, the pinned tree row stated as a
  deliberately-not-`FolderNode`. **A zero-import module**, which is why a `'use client'` file may
  import it.
- `@/lib/admin/chatPhotoActions` — the media arm's six writes: `addChatPhotoAction`,
  `replaceChatPhotoAction`, `removeChatPhotoAction`, `editChatPhotoDescriptionAction`,
  `findChatPhotoDuplicateAction` (the dedupe pre-check), and R3's `describeChatPhotoAction` — the
  vision overwrite the unified panel's media closure fires, which refuses a reference row, picks
  its subject through `describeSubjectForSide`, and answers with the fresh prose. A `'use server'` module, so it crosses
  into the media components as a client reference the same way the tuning action does — its own
  imports, Zod included, stay on the server.
- `@/lib/admin/chatPhotos` — the media collection's pure model, and the reason a client component
  may name it at all: no `zod`, no database — `adminChatPhotoPathname` (the ONLY producer of the
  chat-photo pathname shape, parsed nowhere in this package), `ADMIN_CHAT_PHOTO_CONTENT_TYPE`,
  `ADMIN_CHAT_PHOTO_MAX_DESCRIPTION_CHARS`, and `ADMIN_CHAT_PHOTOS_PATH`, whose value is now
  `/admin/nina`: the constant stayed through the merge and the route it names is the route every
  media action revalidates.
- `@/lib/photos/contentHash` — `contentHashOf`, sha-256 over the exact bytes of what was (or would
  have been) PUT.
- `@/lib/admin/ninaAlbumActions` — every write: `registerNinaAvatarsAction`,
  `listNinaAlbumManifestAction`, `setCurrentNinaAvatarAction`, `saveNinaAvatarCropAction`,
  `describeNinaAvatarAction`, `editNinaAvatarDescriptionAction` (R3's album hand-edit — the media
  side had one since `nina-photo-refs`, the album never did, because nothing on that surface
  rendered the prose to edit), `ensureNinaAvatarDescriptionAction`, `deleteNinaAvatarAction`, and
  phase 6's six: `createNinaAlbumFolderAction`, `renameNinaAlbumFolderAction`,
  `moveNinaAlbumFolderAction`, `deleteNinaAlbumFolderAction`, `moveNinaAvatarsAction`,
  `removeNinaAvatarsAction`. The Media view's adoption lives here too —
  `setChatPhotoAsAvatarAction`, which takes a message image's id plus a DRAFT `scale`/`x`/`y` and
  copies the bytes into a fresh `avatar-` object. `AdminActionResult` comes from here too, as a
  type — since R3 it carries the optional `description` the describe actions return, so the panel
  can show fresh prose in the same round trip.
- `@/lib/admin/folderOps` — **not imported, deliberately.** It holds every folder-operation refusal
  and the Zod schemas behind them, so the components here call the actions and render the sentences
  rather than re-deciding anything. The path helpers that *look* like they live there live in
  `filetree.ts` instead, which is what makes them importable from a client component. (There is no
  `lib/admin/folderPath.ts`; reconciliation deleted it.)
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
- `@/lib/admin/tuningActions` — `/admin/personality`'s ONE write: `saveNinaTuningAction` and
  `AdminTuningResult`. A `'use server'` module, so it crosses into `CharacterPanel` as a client
  reference and its own Zod import stays on the server; since the simplify set it exports exactly
  one action, and a test pins the count.
- `@/lib/admin/tuningModel` — the panel's client-safe model and copy adapter: `TuningDraft`,
  `changedTuningFields` / `tuningDraftEquals` (the predicate under every unsaved mark and the
  status line), the post-save `mergeTuningAfterSave`, `TUNING_DIAL_COMMIT_DEBOUNCE_MS`,
  `tuningCopy`, `relationshipCopy` and `loudestDials`. It imports exactly one module —
  `@/lib/nina/tuning`, zero-import itself — and that is also where the panel takes its key arrays
  and bounds directly (`NINA_TRAITS`, `NINA_DIALS`, `NINA_RELATIONSHIPS`,
  `NINA_TUNING_RELATIONSHIP_KEY`, `NINA_SCORE_MIN`/`MAX`, `NINA_NOTES_MAX`).
- `@/lib/admin/shortcutActions` — `/admin/shortcuts`'s four writes: `addShortcutAction`,
  `saveShortcutCellAction`, `toggleShortcutAction`, `deleteShortcutAction`, and
  `AdminShortcutResult`.
- `@/lib/admin/shortcutModel` — `NINA_TRIGGER_MAX`, `NINA_SHORTCUT_LABEL_MAX`,
  `NINA_SHORTCUT_EXPANSION_MAX`, `ADMIN_SHORTCUT_PAGE`, `formatFired`, and the
  `ShortcutField` / `ShortcutRow` types. **This is the only module `ShortcutTable.tsx` takes its
  bounds from**, and the point of the indirection is that the file then names no `@/lib/nina/`
  specifier — a test asserts it.
- `@/lib/admin/users` — `AdminUserRow`, **as a type only**.
- `@/lib/db/schema` — `NinaPendingPromise`, **as a type only**, so no drizzle table module reaches
  the browser bundle.
- `@/components/ui` — `Button`, `ButtonLink`, `EmptyState`, `Card`, `Field`, `CONTROL_CLASS`, and
  `buttonClasses`, which is exported precisely so a non-`<button>` element — or, in
  `ShareToNinaItem`'s case, a plain `<button>` that must keep `onClick` directly on itself — can
  borrow the look without rendering `Button`. Since the download landed on both rails there is also
  `useSavePhoto` (and its `SaveNotice`), the shared save/download/open ladder both panes warm on
  `pointerdown` and word for their own surface.
- `@/lib/cn` — `cn()`.

**No runtime import in this directory reaches `zod`, `server-only`, or the database.** The two
`@/lib/db/schema` and `@/lib/admin/users` imports are `import type`, so they erase at compile time.
`NINA_ADMIN_BATCH_MAX` comes from `lib/nina/album.ts` rather than `lib/admin/schema.ts` specifically
because `schema.ts` would pull a validator into the `/admin` browser bundle for the sake of an
integer — a module-level `z.object(...)` is a side effect no bundler tree-shakes. `folderOps.ts` is
the same trap one phase later: `FolderMenu` wants three path helpers and would have found them next
to that module's schemas, so it takes them from `filetree.ts` instead. `saveNinaTuningAction` is
that rule holding in the other direction: a `'use server'` export is imported as a client
reference, so the action's module body — Zod included — never reaches the bundle that calls it.

`lib/share/origin.ts` is the same shape of rule and the reason `shareOrigin` is a prop: it opens
with `import 'server-only'`, so nothing in this directory can call it and the answer has to arrive
from a Server Component. The share URL's *grammar* is importable because `lib/admin/shareToNina.ts`
was written to be — the origin is what cannot cross.

## Reverse Dependencies

### Primary consumers

- `app/admin/nina/page.tsx` — `FileExplorer`, plus `ExplorerFolder` and `ExplorerPhoto` as types. It
  gates with `requireAdmin()`, reads one collection and one page, maps rows down to `ExplorerPhoto`,
  and hands the result over. Since the Media view it reads BOTH arms: `readExplorerView(params.view)`
  picks the table — `listNinaAvatarsInFolder`, or `listNinaMediaPhotos` paginated at
  `NINA_CHAT_PHOTO_PAGE_SIZE = 48` — and `countNinaMediaPhotos` feeds the tree badge on both. The
  media arm maps its rows itself: `kind` carried as `source`, `side` computed here by
  `photoSideOf`, and the display filename derived from the row's date and id because the table has
  no filename column. It also calls `shareOrigin()` — the only place that can — and passes the
  string down as a prop. `announcedAt`, `pathname`, `sourceKey` and `thumbPathname` deliberately
  never cross the serialization boundary.
- `app/admin/personality/page.tsx` — `CharacterPanel`, and it is the ONLY mount site of it in the
  repo. It gates with `requireAdmin()`, reads the tuning, calls the pure prompt assembler, and hands
  the panel a `TuningDraft` plus the preview string. `app/admin/nina/page.tsx` no longer imports the
  panel and no longer reads the tuning.
- `app/admin/memory/page.tsx` — `MemoryLedger`, `MemorySlots`, `UserPicker`.
- `app/admin/shortcuts/page.tsx` — `ShortcutTable` and `UserPicker`, and it is the ONLY mount site
  of the table. `force-dynamic`, `requireAdmin()` on line 1, `?user=` defaulting to the signed-in
  admin, and every row built server-side by `buildShortcutRows` so the table receives plain strings,
  numbers and booleans. It passes `basePath="/admin/shortcuts"` to the picker — the second call site
  of that component, and the reason the prop exists.

### Secondary consumers

- `app/admin/layout.tsx` — `AdminNav`.

### Internal to the package

- `FileExplorer.tsx` re-exports `ExplorerFolder`, `ExplorerPageInfo` and `ExplorerPhoto` from
  `explorer/model.ts`, so a consumer needs one import path.
- `SelectionPane.tsx` is the only consumer of `ShareToNinaItem`. `CropStudio` and `CircleFrame` are
  now drawn by BOTH arms: the album pane around a STORED crop, `MediaPane` around an adoption
  DRAFT — which is the point of the studio measuring its own frame. `shareOrigin` is a pure
  pass-through in `FileExplorer`: it is read nowhere between `page.tsx` and `ShareToNinaItem`, and
  consumed only on the album arm.
- `explorer/FolderTree.tsx` is the only consumer of `FolderMenu`, mounted once per `Row` — the
  album root's row included, the Media row never. It is the one place a folder is drawn, which is
  why one control reaches every folder.
- `FileExplorer.tsx` is the only consumer of `PhotoMoveBar`, rendered above `PhotoGrid` in the same
  column, and of `MediaAdd`, mounted in the toolbar in its place while `view === 'media'`.
  `allFolders` and `navigateToFolder` are derived in `FileExplorer` and used by both
  phase-6 components, so `FolderTree` forwards them through its recursion without reading them.
- `MediaPane` is the only consumer of `MediaControls`; `PhotoDescription` has TWO consumers —
  `AlbumSelectionPane` and `MediaPane`, one mount each, each handing in its own table's closures;
  `MediaAdd` and
  `MediaControls` are the only consumers of `explorer/chatPhotoUpload.ts`; and `MediaPane` is the
  only consumer of its own `isMediaRow` guard besides the dispatcher — every other consumer of the
  union narrows through the one function.

### Test consumers

None that IMPORT anything here, and by design. vitest is `environment: 'node'` with no jsdom, so
nothing in this directory is reachable from a test; everything it *decides* was moved to `lib/` to be
tested there. A new pure judgement belongs in `lib/admin/filetree.ts` or `lib/nina/crop.ts`, not
here.

What four suites do instead is read a file in this directory **as text**, to hold a property no pure
function can carry. `tests/admin.shell.test.ts` reads `AdminNav.tsx` for the bottom bar's
`grid h-14 w-full max-w-[470px] grid-cols-6` row, the `h-14`/layout-padding pair, the sr-only
accessible names, and the six distinct inlined glyphs — six, not seven, since the Chat-photos cell
left the bar. `tests/admin.shortcuts.test.ts` reads
`ShortcutTable.tsx` for two
absences: that it names no `@/lib/nina/` and no `server-only` specifier, and that no dialog or
second-click API appears anywhere in it. And `tests/admin.tuning.test.ts` — the third, reading two
more files here since the simplify set — holds the auto-save model in place across
`CharacterPanel.tsx` and `DialSlider.tsx`: the three removed button labels appear nowhere in the
panel's RAW source (comments included), `confirmingReset` and `resetNinaTuningAction` nowhere in
its code, the dials' path names `TUNING_DIAL_COMMIT_DEBOUNCE_MS` and carries both `setTimeout(` and
`clearTimeout(`, the notes field commits through `onBlur={commitNotes}` and contains neither a
timer nor a dispatch of its own, the radios and toggles commit on change, `tuningDraftEquals(`
guards at least three sites with `mergeTuningAfterSave(` present, `disabled={pending}` is absent,
and the three status-line strings are spelled. All of these are guards against a future edit rather
than tests of behaviour — which is why the docstrings in those files are written never to *spell*
the specifiers and API names they explain: a text guard cannot tell an explanation from a
reintroduction. The tuning suite splits the difference precisely: identifier assertions run through
`codeOnly()`, which strips block comments, so the panel's docstring MAY discuss the deleted action;
the label assertions read the raw file, so nothing in `CharacterPanel.tsx` — prose included — may
spell *"Save the whole tuning"*, *"Discard changes"* or *"Reset to defaults"*.

`ShareToNinaItem` is the worked example. The component itself is untested and untestable — it is
`window.open`, `useTransition` and a click — but the one thing about it that can be *wrong on
paper*, the link's grammar, was put in `lib/admin/shareToNina.ts` and is covered by
`tests/admin.shareToNina.test.ts`, which round-trips the URL back through phase 3's
`parseNinaPhotoParam` rather than asserting literal bytes. That split is the rule, not a compromise.

Phase 6 is the same worked example at a larger size. `FolderMenu` and `PhotoMoveBar` have no tests
and cannot have any; everything they could get *wrong on paper* — a name that sanitises away, a
depth over the bound, a collision, a folder moved inside its own tree, the depth check run against
the deepest descendant rather than the destination, and the current-photo refusal — is in
`lib/admin/folderOps.ts` and covered by `tests/admin.folderOps.test.ts`.

The media merge added the newest text-reading suite and retired one. `tests/admin.mediaPane.test.ts`
reads the four files the media rail is spread across (`MediaPane`, `MediaControls`, `MediaAdd`,
`SelectionPane`) with comments stripped and pins the properties a later edit could
quietly reverse: the prompt toggle INSIDE the `photo.prompt != null` conditional with no dim state
for prompt (the defect the owner named), the dispatcher on `isMediaRow` with the pane keyed by
`photo.id`, `MediaControls`' fragment idiom and its `basis-full` inline messages, `MediaAdd`'s
`{ dedupe: true }` and a `userId` prop that never comes from a client session — and, since R3,
that BOTH arms mount `<PhotoDescription` with their own table's actions while
`MediaDescription.tsx` is gone (the suite asserts the file's absence) and no eye icon remains in
`MediaPane`; the suite's two interim seam pins retired with the seam itself.
`tests/admin.chatPhotosRail.test.ts` retired with the surface it
read — its components are gone, and the suite's job moved with the verbs.

## Data flow

```
app/admin/nina/page.tsx  (Server Component, force-dynamic, requireAdmin() on line 1)
  │  validateFolderPath(?folder)  ·  readPage(?page)  ·  two parallel reads
  │  shareOrigin()   ← server-only, resolved HERE, handed down as a string
  ▼
FileExplorer  ─── FolderTree ──────────► <Link href="?folder=…">  (server re-read)
      │             └── Row/FolderMenu ► create / rename / move / delete folder
      │                    │              └─► AdminActionResult.folder ──► navigateToFolder()
      │                    │                  (a create also ──► addPendingFolder() ──► allFolders)
      │      ─── PhotoMoveBar ────────► moveNinaAvatarsAction([selectedId], folder)
      │                    │            removeNinaAvatarsAction([selectedId], keepCurrent)
      │                    │              └─► onDone() clears phase 5's selection
      │      ─── PhotoGrid ───────────► <Link href="?page=…">     (server re-read)
      │      └── SelectionPane ───────► setCurrent / saveCrop / delete
      │                    │      └─ PhotoDescription ► editNinaAvatarDescriptionAction /
      │                    │          describeNinaAvatarAction   (subject 'self', always)
      │                    │                   └─► revalidatePath('/admin/nina')
      │                    └── ShareToNinaItem  (one click, in this order)
      │                            1. ensureNinaAvatarDescriptionAction  ← FIRED, never awaited
      │                            2. window.open(ninaPhotoShareUrl(origin, id), '_blank',
      │                                           'noopener')            ← inside the activation
      │                          the new tab: /nina?photo=avatar:<id>, phase 3 parses and arms
      │                          the composer; nothing is sent from here
      │
      │  ?view=media ── the second arm, same chrome (tree · breadcrumb · pager · rail stay put)
      │      toolbar: MediaAdd ──► encodeChatPhotoJpeg → contentHashOf
      │                   ├─ dedupe hit? → findChatPhotoDuplicateAction → SKIP the PUT
      │                   └─ PUT selfie-<id>.jpg → addChatPhotoAction (carrier message)
      │      SelectionPane ── isMediaRow? ──► MediaPane (keyed by photo.id — remount is the reset)
      │                   ├─ setChatPhotoAsAvatarAction({ id, scale, x, y })  ← adoption, DRAFT crop
      │                   ├─ replaceChatPhotoAction / removeChatPhotoAction   ← MediaControls
      │                   │      └─ a remove's note ──► onRemoved ──► FileExplorer.notice
      │                   └─ editChatPhotoDescriptionAction / describeChatPhotoAction
      │                      ← PhotoDescription (hand edit + vision overwrite; subject follows
      │                        the photo through describeSubjectForSide)
      │                          └─► revalidatePath(ADMIN_CHAT_PHOTOS_PATH) — '/admin/nina'
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
(`SelectionPane`, `PhotoMoveBar`, one per `FolderMenu` — so one per tree row — and one per
row/editor in `MemoryLedger` and `MemorySlots`), and `CropStudio`'s pointer capture keyed by
`pointerId`. No component here spawns work that outlives it, and nothing polls.

The Media view adds one deliberate NON-concurrency: `MediaAdd`'s multi-file pick is a sequential
`for` loop, because Server Actions dispatch one at a time per client and `Promise.all` would
parallelize nothing. Its per-file failures are collected, not fatal — the loop records the message
and continues.

The personality panel owns this package's one `setTimeout` and its one queued-write surface. The
dial settle timer is cleared on re-arm, on subsumption by an immediate commit, and on unmount, so no
save fires into a dead component; and because Server Actions dispatch one at a time per client, the
commits a fast drag mints cannot interleave — each queues behind the last, and each is a whole-row
idempotent upsert, which is the property that makes auto-save safe at all (see the character-panel
section).

The folder operations need no gesture counter of their own. Each is a single awaited action inside
one component's transition, its result is consumed by the `onOk` of the call that made it, and the
only cross-component write is `navigateToFolder`, which is a `router.push` — so there is nothing for
a superseded promise to patch. Server Actions also dispatch one at a time per client, which means
two menus cannot land two folder writes concurrently even when the operator opens two.

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
- **Per tuning commit**, in `CharacterPanel`'s `result` — the action's own sentence (*"The write
  failed and nothing was changed — move any control to try again."*, which names the retry that
  exists now there is no Save button to press again), rendered as a red paragraph at the foot of
  the panel while the status line falls back to "Unsaved edits". Nothing was written, so `saved`
  stays where it was and the pending dots still name exactly what did not land.
- **Per folder operation**, in `FolderMenu`'s and `PhotoMoveBar`'s `error` state, also
  `role="alert"` — and the string is the server's own sentence from `lib/admin/folderOps.ts`,
  never a client paraphrase and never matched on. `FolderMenu` renders it as one more `absolute`
  280 px overlay so it cannot reflow the rail it is sitting in. The `note` beside it is the
  counterpart on success: `ok` is `true`, the operation did what was asked, and the operator still
  needs to be told what a `keepCurrent` delete left behind.
- **The one refusal with a second answer** is the current photo's. It arrives as an ordinary error
  and is then *converted into an affordance*: `FolderMenu` sets `keepOffer` when a refusal lands
  with the delete panel open, `PhotoMoveBar` warns from `currentId` before the click, and either
  way the follow-up is a button the operator presses rather than a state the client guessed.
- **Per action in a pane**, inline where it fired — `MediaControls`' `basis-full` lines under the
  icon row, `PhotoDescription`'s own `error` / `note` paragraphs inside its section (both arms),
  `MediaAdd`'s per-file failure list —
  never a route-level error surface. The one message that cannot render where it happened is a
  successful REMOVE's `note` ("the bytes are still in the store; another row references them"): the
  pane unmounts under the revalidation that carries it, so `FileExplorer` holds it in `notice` and
  renders it under the toolbar until the next removal replaces it.
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
- **No vision call is on any upload path in this package.** The `glm-4.6v` describe (~8–11 s) was moved off
  the upload path entirely; it is scheduled by the promote action on `after()`. Three hundred awaited
  describes would have been 40 minutes to 1.4 hours of wall clock. The ONE vendor call a click can
  start here is `PhotoDescription`'s describe button — user-initiated, one row, spinner-bounded,
  overwriting by design — which is not an upload path.
- **A folder operation moves no bytes.** A rename or a move is one UPDATE of the `folder` column, so
  reorganising four hundred photographs costs one statement and zero blob traffic. That is the whole
  reason the album stores a path in a column rather than in the blob pathname.
- `buildTree` and the on-path set in `FolderTree` are `useMemo`'d on `folders` and `current`;
  `allFolders` is `useMemo`'d in `FileExplorer` and each menu's `moveTargets` on top of it. The
  target lists are small and the memos are about identity for the `<select>`, not about cost.
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
- **Do not render `description` on any runner-facing surface.** Invariant 5 — the description's one
  image path into her turn is still the text block `userTurnText` renders, never an image part.
  The admin surface is the deliberate exception since R3: `PhotoDescription` renders and edits the
  prose on BOTH arms, because the description is exactly the thing the rail exists to correct, and
  the one human on both sides of the click is the same witness. Runner components gained no reader.
- **Do not import a server action into `PhotoDescription.tsx`.** The host arm hands in
  `onSave` / `onRedescribe` closures precisely so a rename in either action family fails at the
  call site in that arm — and so the one panel cannot grow a guess about which table it is mounted
  over. The album closures live in `AlbumSelectionPane`, the media ones in `MediaPane`.
- **Do not re-grow a describe button in an icon row, or a null-ness row in a facts `<dl>`.** R3
  removed all four — the album arm's null-guarded "Describe it" button, both arms' *"Cannot talk
  about this photo yet"* rows, and `MediaPane`'s eye toggle — in favour of the one panel;
  `tests/admin.mediaPane.test.ts` asserts `MediaDescription.tsx` no longer exists and no eye icon
  remains in the pane.
- **Do not add a second upload path to this screen.** Two upload paths in one screen is exactly what
  `UploadAvatar.tsx` became and why it was deleted.
- **Do not pass `dedupe` to a Replace.** `uploadChatPhoto`'s opt-in exists for Add alone: a deduped
  replace would point the row at another row's object and strip its provenance to a reference,
  which the collection reads then hide — the photograph the operator can see vanishes from the
  folder. Replace claims the hash and never the skip.
- **Do not give a media row a stored crop, a "Save framing" or a thumbnail.** `nina_message_images`
  has no crop column and no thumbnail column; framing there is an ADOPTION draft whose only
  consumer is `setChatPhotoAsAvatarAction`, and `thumbUrl` is typed `null` so it cannot grow one by
  accident.
- **Do not move the prompt toggle outside its conditional, and do not give it a dim state.** The
  toggle lives INSIDE `photo.prompt != null`: a replaced or hand-added row has no sidecar, and a
  dimmed button for a prompt that will never exist is the exact defect the owner named.
  `tests/admin.mediaPane.test.ts` reads the source and pins it.
- **Do not parse or display a chat-photo pathname.** `adminChatPhotoPathname` is the only producer
  of the shape; the stored value is never split, matched or inferred-from, and the served content
  type is the only authority for what the bytes are.
- **Do not render a remove's `note` in the pane that removed the row.** The pane unmounts under the
  revalidation that carries the sentence, so it goes up to `FileExplorer` via `onRemoved` and
  renders there.
- **Do not put a new pure judgement here.** It cannot be tested in this directory. Put it in
  `lib/admin/filetree.ts` and import it.
- **`selectedId` is allowed to dangle.** Do not add an effect to reconcile it; the `find(...) ?? null`
  is the design.
- **Do not validate a folder name, a collision or a move target in this directory.** Every one of
  those rules is in `lib/admin/folderOps.ts` and every one of them is a sentence the operator reads.
  A client-side copy is a second rule that can disagree with the first, and the direction it usually
  disagrees in is forbidding what the server would have allowed — which is unfalsifiable from the UI.
- **Do not import `lib/admin/folderOps.ts` here.** It carries the Zod schemas. `folderName`,
  `folderParent` and `isInFolderTree` are in `lib/admin/filetree.ts`, which is zero-import.
- **Do not add an in-page drag protocol to the tree or the grid.** Those elements are phase 5's
  `dragover`/`drop` for the Windows Explorer folder walk, and one handler cannot tell an OS folder
  from an in-page selection without failing silently in both directions. The `<select>` is the
  gesture; internal drag-to-move is a follow-up card.
- **Do not disable a delete or a remove because her current photo might be in it.** The client cannot
  know — the grid is one page of one folder — and the server's refusal is better than a greyed
  button anyway: it names the photo and both fixes. Take `keepOffer`'s route and add the second
  button, not a `holdsCurrent` prop.
- **Do not treat `pendingFolders` as where a new folder lives.** It is a one-render bridge;
  `nina_folders` is the storage, and the merge is a filter so a server-known folder drops out of it.
- **Do not lay a `FolderMenu` panel out inside `Row`.** It is a 200 px flex line. The panels are
  `absolute`, 280 px, `z-40`; a fourth flex item wraps the text field into ~60 px. The `z-40`
  clears `AdminNav`'s `z-30` bottom bar below `lg` — lowering it hides Delete and Move behind the
  bar on the last row of the rail.
- **Do not branch on the text of a refusal.** `keepOffer` comes off `mode === 'delete'` for exactly
  this reason: the server owns the wording and must stay free to change it.
- **The thumbnail upload's third argument is `'jpg'`.** The Route Handler cross-checks the pathname's
  extension against the declared content type and a mismatch is a 400.
- **Never give `CircleFrame` a non-square `sizeClass`.** It is not validated, it will not throw, and
  the failure is a silently stretched y offset — because `top: N%` resolves against height while
  `left: N%` resolves against width.
- **Do not "fix" `MemorySlots`'s render-time `setDraft` into an effect.** The render-phase adjustment
  is the correct React pattern here; an effect paints the stale draft for a frame and the lint rule
  rejects it. A `key`-based remount is also wrong — it discards the success note.
- **Do not add active-link highlighting to `UserPicker`, and do not read the pathname anywhere in
  this package but `AdminNavLinks.tsx`.** This rule used to name `AdminNav` too — *"Do not add
  active-link highlighting to `AdminNav` or `UserPicker`. `usePathname()` would turn a static nav
  into a Client Component to bold one word."* — until the owner's own order for the active cell's
  blue icon (`admin-bottom-bar-active-tab`) overruled the `AdminNav` half. What survives, and what
  this bullet now holds, is the rule's arithmetic: a `usePathname()` read costs a client boundary,
  so it is paid once, in the smallest subtree that needs it — the nav's list leaf — and nowhere
  else. `AdminNav.tsx` stays a Server Component (`tests/admin.shell.test.ts` pins both sides). In
  `UserPicker` the trade still buys nothing: `aria-current` already carries the state to assistive
  tech, and its `basePath` prop is the same rule applied to the href — both callers are Server
  Components and both already know their own route.
- **Do not import from `@/lib/nina/` in `ShortcutTable.tsx`.** The three caps come through
  `@/lib/admin/shortcutModel`, which re-exports them; a test asserts the absence. The next specifier
  copied in from that directory is the one that reaches zod and `lib/db/schema.ts`.
- **Do not add a confirmation to the shortcut table.** The `✕` deletes on the first click, and the
  test names every dialog and second-click API it forbids. For the same reason, do not *spell* those
  names in a comment in that file — the guard reads the source and cannot tell the two apart.
- **Do not make an emptied shortcut cell delete its row.** It is refused and reverted on purpose: a
  stray select-all-and-tab must not destroy a shortcut when the delete control is three columns away.
- **Do not make the on/off checkbox optimistic.** Only the delete is. A draft on `row.enabled`
  would show "on" for a row the write is about to refuse.
- **Do not give the shortcut table its two-click on/off dropdown back.** The checkbox in the first
  column is the toggle in one click, and a test pins the property by forbidding the dropdown's
  machinery in that file — so, as with the no-confirmation suite, the cell's comment must not spell
  the machinery it is arguing against.
- **Do not put words back in a phone nav cell.** The one-row bar is what icons bought
  (`admin-bottom-bar-icons`: each cell a 24 px glyph with its sr-only `short` as the accessible
  name), six cells since the Chat-photos route merged into `/admin/nina` — 414 px / 6 = 69 px, wider
  than the seven it replaced; a seventh route widens to `grid-cols-7` (59.1 px a cell, still past
  the 44 pt target) rather than reopening the two-row text layout — and if the row count ever does
  change, `h-14` is paired with `app/admin/layout.tsx`'s
  `pb-[calc(5rem+var(--safe-bottom))]` in a test, and both move together.
- **Do not give the personality panel back a Save button, a `disabled={pending}` lock, or a
  keystroke debounce on the notes.** The auto-save model is load-bearing in exactly the places a
  "harmless" rollback breaks: the staged-commit row rode a second action the simplify set deleted
  (the test pins the one-export count and forbids the removed identifiers), locking on every
  debounce settle would flicker the whole panel uneditable for a round trip at a time — the test
  forbids the substring — and a notes debounce queues writes the blur rule exists to prevent.
  Typing must touch only the draft; the commit moments are the character-panel section's, and
  `MemoryTable`'s before that.

## Notes

Eleven files have been retired from this package, and none of them should come back. Two went when
this screen landed: `AlbumManager.tsx` (superseded by `FileExplorer` plus the five `explorer/`
modules; its framing half was moved verbatim into `SelectionPane`) and `UploadAvatar.tsx`
(superseded by the folder-aware queue, which also retired the singular
`registerNinaAvatarAction` in `lib/admin`). Eight went with the Chat-photos merge (task
`P1-RI-A035`): `ChatPhotoGrid.tsx`, `ChatPhotoDetail.tsx`, `ChatPhotoControls.tsx`,
`ChatPhotoAdd.tsx`, `ChatPhotoDescription.tsx`, `ChatPhotoProfilePicture.tsx`, `chatPhotoModel.ts`
and `chatPhotoUpload.ts` retired with the `/admin/photos` route — their verbs migrated into
`explorer/MediaPane` / `MediaAdd` / `MediaControls` /
`explorer/chatPhotoUpload.ts`, and the route itself is gone, so a second photos surface must not
grow back next to the explorer's Media view. The eleventh is `explorer/MediaDescription.tsx`
(task `P1-CA-A005`): Phase 2 built it as a marked interim seam, and Phase 3 retired it with its
own replacement — `ChatPhotoDescription`'s textarea idiom, which it carried through the seam, now
lives in `explorer/PhotoDescription.tsx`.

Three seams have been marked in the source for phases beyond the one that wrote them, and all
three are now closed:

- **Phase 6, folder maintenance** — **closed**, and it took the seam's second half rather than its
  first. `FolderTree.tsx`'s note is now `SEAM — PHASE 6, TAKEN` and records why: the sketched "New
  folder" button under the `<nav>` was dropped in favour of putting all four verbs in `FolderMenu`
  on `Row`, because a per-folder menu makes the create's parent the folder whose menu was opened
  instead of whatever the rail has selected. `Row` being "already the single place a folder is
  drawn" is what the seam got exactly right: one component gained one control and every folder,
  root included, got a menu.
- **Phase 7, "Share link to Nina"** — **closed**, and it cost exactly what the seam predicted: one
  entry in `SelectionPane`'s action list (`ShareToNinaItem`), one prop threaded
  `page.tsx -> FileExplorer -> SelectionPane -> ShareToNinaItem`, and nothing about selection
  restructured. `SelectionPane.tsx` still carries the `SEAM — PHASE 7` comment block immediately
  above the item it now renders; the paragraph explaining the leading-`*` comment style is still
  load-bearing and must stay, but the seam's own "phase 7 will need to…" prose now describes work
  that is done and reads as stale next to the `<ShareToNinaItem …>` three lines below it.
- **Phase 3, the unified describe panel — closed** (task `P1-CA-A005`). `MediaDescription.tsx`
  carried `SEAM — PHASE 3` and is gone; the replacement was wholesale exactly as the seam asked.
  `PhotoDescription.tsx` is the one panel, `MediaPane` lost the eye toggle, its `showDescription`
  state and its null-ness `<dl>` row around it — the part the seam itself predicted — and the
  album arm gave up its null-guarded "Describe it" button and its own null-ness row to the same
  panel, the part the seam could not predict because the dispatcher that made the shared mount
  possible is Phase 2's. The old claim that *nothing else in the explorer needs to change* held
  for the file's own arm and not for the album's; the panel being its own file is still what made
  both halves one move.

Known, accepted limitations: folder sort is lexicographic rather than natural; a tile can repeat
across two consecutive pages while an upload is in flight (nothing is ever skipped); empty
directories in a dropped tree are invisible to the browser and so cannot survive an upload; and a
Media row never gets a thumbnail, so its grid loads originals at 48 a page.

Phase 6 adds three more, all deliberate. **Multi-select is not built** — `PhotoMoveBar` acts on
phase 5's single `selectedId` and wraps it in an array, so "N photos selected" reads "1" today; the
actions are plural already, which makes multi-select a client-only change when it comes. **Internal
drag-to-move is not built**, for the reason above, and is a follow-up card rather than an oversight.
And **no folder operation has been run against real rows**: migration `0003` is applied to no live
database, so the guarantees in this section are the ones typecheck, build and
`tests/admin.folderOps.test.ts` can give, and nothing here should be read as runtime-verified.

One note on the JSX comment style in `SelectionPane.tsx`: the leading `*` on every continuation line
is load-bearing. `ci:client-secret-guard`'s Rule 3 forbids a particular string anywhere in `app/`,
`lib/` or `components/`, and its comment exemption recognises `//`, `/*` and `*` — so a JSX comment
whose continuation lines are bare prose fails the guard while quoting the rule it is obeying.

The character panel adds one accepted limitation. **There is no live preview of a bubble** — the
panel shows the assembled *prompt*, not a sample reply, because a sample reply is a model call and
Rule 2 puts that off a render entirely. Seeing the effect of a dial means moving it and talking to
her — the save is the drag settling; there is no cache anywhere on the turn path, so the next
message she sends is already the tuned one.

## Documentation Created

2026-09-04 — initial creation via `/update-readme`, following task **P1-RI-A003**
(`admin-album-file-manager` phase 5, `/admin/nina` as a file manager). That task added
`FileExplorer.tsx` and the five `explorer/` modules — the folder tree, the folder-scoped paginated
grid, the drag-and-drop folder walk, the `webkitdirectory` picker, client-side thumbnail derivation,
the four-lane upload queue with chunked registration, the selection pane and "Set as profile
picture" — re-hosted `CropStudio` and `CircleFrame` unchanged, and deleted `AlbumManager.tsx` and
`UploadAvatar.tsx`.

2026-09-04 — updated following task **P1-RI-A004** (`admin-album-file-manager` phase 6 of 7,
requirement R1's second half, folder maintenance). It closed phase 5's `SEAM — PHASE 6`: added
`FolderMenu.tsx` (New subfolder / Rename / Move to… / Delete, as a `mode` union with `absolute`
overlay panels, mounted once per `FolderTree` `Row` including the root's) and `PhotoMoveBar.tsx`
(move / remove for the current selection, `null` when nothing is selected), gave `FolderTree` the
required `allFolders` / `onNavigate` / `onFolderCreated` props and threaded them through its
recursion, and gave `FileExplorer` `pendingFolders`, the derived flat `allFolders` and
`navigateToFolder`. Every rule and every refusal went to the new pure `lib/admin/folderOps.ts`
(tested in `tests/admin.folderOps.test.ts`) and the six Server Actions in
`lib/admin/ninaAlbumActions.ts`; neither new component imports `zod` or decides anything. Phase 5's
selection model was not restructured.

2026-09-04 — updated following task **P1-RI-A005** (`admin-album-file-manager` phase 7 of 7,
requirement R2, "Share link to Nina"). It closed phase 5's `SEAM — PHASE 7`: added
`ShareToNinaItem.tsx`, threaded a `shareOrigin` string prop from `app/admin/nina/page.tsx` through
`FileExplorer` and `SelectionPane`, and left the URL grammar itself in the new pure
`lib/admin/shareToNina.ts` (`ninaPhotoShareUrl`) so it could be tested in Node. Nothing else in the
package changed shape.

2026-09-05 — updated following `nina-character-tuning` phase 6 of 6 (requirement R6, the sweep and
the record), documenting phase 5's work (requirements R1, R2, R3). Phase 5 added
`CharacterPanel.tsx` and the `DialSlider.tsx` primitive `components/ui` does not carry, mounted the
panel collapsed above the explorer on `/admin/nina`, and threaded the server-assembled prompt
preview down as a plain string. Every rule and every bound stayed in `lib/nina/tuning.ts` and
`lib/admin/schema.ts`, and the copy the panel renders comes from `lib/admin/tuningModel.ts`, the
client-safe adapter over phase 1's specs; neither new component decides anything or imports `zod`,
so this package still has no test files and that is still correct.

2026-09-07 — updated following task **P2-CA-A002** (`nina-personality-tab` phase 1, R1: *"right now,
'Her character' is in Nina's album. move it as a new tab with name: Personality."*). A placement
change only — no control's behaviour, no bound, no label and no prompt moved with it.
`CharacterPanel.tsx` stopped being a shut `<details>`/`<summary>` above the explorer and became an
always-open `<section>` that is the whole content of the new `/admin/personality` route, keeping
`id="character"` on its root so the old album fragment link still lands somewhere real; it remains
`'use client'` and still imports nothing from `lib/nina` but `tuning.ts`. `AdminNav.tsx` gained a
fifth cell (Personality at `lg`, Persona on a phone) and went `grid-cols-4` -> `grid-cols-5` at the
same `h-14`, still with no `'use client'` and no `usePathname()`. `app/admin/page.tsx`'s "Tune her
character" hub card now points at the route rather than a fragment. No component was added, deleted
or renamed, and no prop signature changed.

2026-09-07 — updated following task **P1-ADM-A001** (`nina-emoji-shortcuts` phase 3 of 4, R1: *"i
want a mechanism that is more explicit, that is shortcuts. in shortcuts admin can add shortcuts that
entails some situations or what miftah and nina were doing."*). One new component and two additive
edits; nothing was deleted, renamed, or changed in behaviour.

`ShortcutTable.tsx` is `MemoryTable.tsx`'s mechanics with different columns — the same
`CELL_CONTROL` / `CELL` / `HEAD_CELL` tokens verbatim, blur-to-save cells with a draft adjusted
during render, an optimistic delete and nothing else optimistic, the add row at the TOP of a
newest-first table, and no confirmation anywhere. Its six columns are trigger · label · expansion ·
on/off · fired · ✕, with `Fired` the one `hidden lg:table-cell` because it is the one column the
operator reads rather than acts on. It takes its three `maxLength` caps through
`@/lib/admin/shortcutModel` rather than from `@/lib/nina/shortcuts` directly, so the file names no
`@/lib/nina/` specifier at all; `tests/admin.shortcuts.test.ts` asserts that, and asserts the
absence of every second-click API by name.

`AdminNav.tsx` gained a sixth `LINKS` entry — `{ href: '/admin/shortcuts', label: 'Shortcuts',
short: 'Shortcut' }`, placed last because Memory is the page this surface grew out of — and went
`grid-cols-5` -> `grid-cols-6` at the same `h-14`. The 8-character `short` ceiling in
`tests/admin.shell.test.ts` was deliberately NOT loosened, and the three assertions there that
encode the cell count moved from five to six. `UserPicker.tsx` gained one optional, defaulted
`basePath = '/admin/memory'` prop so the pills can navigate within `/admin/shortcuts`; no existing
call site was edited and the pill counts remain memory counts, which are still true of the account
if not of that page.

Refreshed here: the overview's two "five-cell" sentences, three module-map rows, a new
`/admin/shortcuts` section covering the table and the two additive edits, two dependency bullets,
one primary consumer, the test-consumer section (which now names the two suites that read a file in
this directory as text, and why that is not an import), and six gotchas. This package still has no
test file of its own, and that is still correct.

2026-09-09 — updated following task **P1-RI-A025** (`simplify-personality-settings` phase 1 of 2,
the prompt-revision purge). One prop and everything that rendered it left `CharacterPanel.tsx`:
`revision: number` is gone from the props, the section header reads "relationship · loudest dials ·
*N* off" without the trailing "· revision *N*", and the prompt-preview `<summary>` no longer names
a revision. The draft-reset that used to watch `revision !== lastRevision` now watches content —
`tuningDraftEquals(tuning, lastTuning)` — which resets the draft exactly when the canonical row's
content changes under it and lets a server-side trim (a coerced `notes`, say) land without a
counter to announce it. `DialSlider.tsx` lost only a doc-comment clause comparing the rendered
number against `nina_turns`' recorded revision. No control, bound, label or prop signature beyond
the removed one changed, and the Save/Discard/Reset button model is untouched — phase 2 of the set
owns replacing it. Migration `drizzle/0016_retire_tuning_revision.sql` is committed but NOT
applied; applying it is the post-deploy `npm run db:migrate`. Refreshed here: one clause of the
character-panel section.

2026-09-09 — updated following task **P1-RI-A026** (`simplify-personality-settings` phase 2 of 2,
R2: *"remove the Discard and Reset buttons; make Personality auto-save every time a change is
made."*). `CharacterPanel.tsx` replaced the staged-commit row with auto-save: the Save / Discard
changes / Reset to defaults buttons and `confirmingReset` are gone, dials commit through a
`TUNING_DIAL_COMMIT_DEBOUNCE_MS` settle timer (cleared on re-arm, on subsumption by an immediate
commit, and on unmount), toggles and the relationship radios commit on change, the notes commit on
blur, a tri-state Saving…/Saved/Unsaved-edits status line replaced the "N unsaved" counter, and
`saved` — the panel's live belief about the stored row — is maintained from the action's result and
adopted per-field through `mergeTuningAfterSave`, so a coerced notes value lands without clobbering
edits made since dispatch. `DialSlider.tsx` lost only doc-comment prose: its props are unchanged and
`ImageGenPanel` still shares them, its per-dial "default N" chip now being the surviving route back
to defaults. On the lib side (`tuningActions.ts`, `schema.ts`, `tuningModel.ts`) the reset action
and schema were deleted, leaving one whole-tuning save whose result carries the stored row, and
every docstring citing the old model was reworded — including `lib/admin/imageGenActions.ts`'s.
Refreshed here: the header, four module-map rows, the character-panel section (rewritten around the
commit moments, the canonical merge and the status line), the prompt-preview paragraph, one Notes
limitation sentence, one concurrency paragraph, one error-handling bullet, the test-consumer section
(a third text-reading suite), two dependency bullets, the zod-boundary paragraph, and one new
gotcha.

2026-09-09 — updated following task **P1-RI-A029** (`admin-imagegen-simplify` phase 2 of 3, the
image-prefs revision purge; phase 1 of the set, `P1-RI-A028`, had refreshed `lib/admin`'s readme
only, so the `ImageGenPanel` rows here carry both phases). `ImageGenPanel.tsx` lost its `revision`
prop: the "revision N" words at the end of the section header and inside the prompt-preview
`<summary>` are gone, and the header now ends at "… · one reference". No other prop, control, label
or commit moment moved — the auto-save pipeline phase 1 landed stands as it left it. Migration
`drizzle/0017_retire_imageprefs_revision.sql` is committed but NOT applied; applying it is the
post-deploy `npm run db:migrate`. Refreshed here: the `Last Updated` line and the
`ImageGenPanel.tsx` / `DialSlider.tsx` module-map rows, which still described the staged-commit
save model, the reset and the dirty state that phases 1 and 2 deleted.

2026-09-09 — updated following task **P1-RI-A031** (`admin-imagegen-simplify` phase 3 of 3, the
focus-card hint purge). `ImageGenPanel.tsx`'s six "Focus on" cards lost the hint line under each
checkbox — it rendered the focus spec's `userSaid`, which repeated the label back in lower case
("face" under Face) — so each card is now one label span carrying the "unsaved" marker. The
module-map row above never described that line, so nothing here went stale; only the
`Last Updated` line needed the phase. The member the hint read is deleted from
`NINA_IMAGE_FOCUS_SPECS` in `lib/nina/imageprefs.ts`, and `imageFocusCopy` returns the label as a
plain string (`lib/admin/imageGenModel.ts`).

2026-09-10 — the shortcut table's on/off dropdown became a checkbox in the table's first column,
at the owner's hand: "on" to "off" through a picker was two clicks where a toggle owes one. The
checkbox is `DialSlider`'s per-dial idiom whole — `TOUCH_ICON` `<label>` for the 44 px target,
`size-4 accent-accent` glyph, `sr-only` name — and still saves on CHANGE, still through the
non-optimistic `toggleShortcutAction`. The add row answers with a disabled, checked, decorative
box where its word "on" used to sit, and `tests/admin.shortcuts.test.ts` gained the guard that
keeps the dropdown from coming back.

2026-09-11 — updated following task **P1-RI-A035** (`image-collection` phase 2 of 4, the
Chat-photos merge; phase 1, `P1-RI-A034`, landed the read-only Media view and refreshed the root
readme, not this one — so this entry catches this package up on both). The `/admin/photos` surface
and its eight files are deleted; the media rail is re-hosted as `explorer/MediaPane.tsx` (the
pane), `MediaAdd.tsx` (the toolbar Add, on a carrier message), `MediaControls.tsx` (Replace /
Remove, no confirmation), `MediaDescription.tsx` (the hand-edit, marked `SEAM — PHASE 3`) and
`explorer/chatPhotoUpload.ts` (re-homed beside `thumbnail.ts`). `SelectionPane.tsx` is now a
two-line dispatcher over the `isMediaRow` guard; `FileExplorer.tsx` wired the media view's toolbar,
pager and breadcrumb with no prop change beyond phase 1's `view` / `mediaCount`; and
`AdminNavLinks.tsx` lost the Chat-photos cell (`grid-cols-7` -> `grid-cols-6`, the camera glyph
with it). Every original `nina_message_images` row — generated AND hand-added — is now
replaceable, describable and adoptable from `/admin/nina`; the kind refusals in `lib/admin`
lifted with the merge. Refreshed here: the header, the overview, the directive-free census, the
touch and invariant-6 paragraphs, two Key Responsibilities bullets, fourteen module-map rows (two
Chat-photos rows deleted; six added — the media family plus `photoIcons.tsx`; six refreshed), the
URL-grammar section, the panes section, a new Media-view section, the folder-maintenance and
concurrency sections, one error-handling bullet, three new dependency bullets and three refreshed
ones, both reverse-dependency lists, the test-consumer section (a fourth text-reading suite;
`tests/admin.chatPhotosRail.test.ts` retired with its surface), the dataflow diagram's second arm,
five new gotchas, the retired-files and seams notes, and this log.

2026-09-11 — updated following task **`P1-CA-A005`** (`image-collection` phase 3 of 4, R3: one
describe control everywhere; described photos reach Nina's context). `explorer/PhotoDescription.tsx`
is the ONE describe panel, mounted inside BOTH arms of the dispatcher — `AlbumSelectionPane` hands
it the album closures (`editNinaAvatarDescriptionAction`, new in `lib/admin/ninaAlbumActions.ts`,
and `describeNinaAvatarAction`), `MediaPane` the media ones (`editChatPhotoDescriptionAction` and
the new `describeChatPhotoAction` in `lib/admin/chatPhotoActions.ts`) — and it imports no server
action itself, so no `origin` discriminant is read anywhere below the dispatcher.
`MediaDescription.tsx` (Phase 2's interim seam) is deleted; `MediaPane` lost its eye toggle, its
`showDescription` state and its null-ness `<dl>` row; `AlbumSelectionPane` lost its null-guarded
describe button and its own null-ness row, and the describe verb left both icon rows. The
describe button is always available, runs the vision model and OVERWRITES with no confirmation;
the album's describe stopped pointing the runner prompt at photos of Nina — every describe path
now picks its subject through `describeSubjectForSide` (`lib/nina/album.ts`: hers → `'self'`,
his → `'runner'`), and `lib/nina/vision.ts`'s `subject` docstring was de-staled to name the one
mapping. The Zod boundary for the new action (`chatPhotoDescribeSchema`) and the shared
`chatPhotoDescriptionField` live in `lib/admin/chatPhotoSchema.ts`, whose normalizer
`lib/admin/schema.ts`'s `avatarDescriptionSchema` now reuses instead of a second copy; and
`ChatPhotoActionResult` and `AdminActionResult` both gained an OPTIONAL `description?: string`,
so fresh prose reaches the panel in the describe round trip. On the runner side of the task,
`lib/nina/gateway.ts`'s `readMessageWindow` stopped hardcoding `imageDescriptions: []` —
described rows in the conversation window now carry their prose into EVERY turn's assembled
context (described rows only, reference rows included, bounded by the column's 2000-character
ceiling at the write side), the stale coverage claim in `lib/nina/actions.ts` was corrected, and
the related reads moved in `lib/admin/chatPhotos.ts`, `lib/admin/schema.ts` and
`lib/admin/ninaAlbumActions.ts`. Tests: `tests/nina.gateway.window.test.ts` and
`tests/nina.sendDescriptions.test.ts` new; `lib/nina/vision.test.ts`,
`tests/admin.mediaPane.test.ts`, `tests/nina.resend.test.ts`,
`tests/admin.chatPhotoAdoption.test.ts` and `tests/nina.gateway.patterns.test.ts` adjusted; full
suite 3801 green. Refreshed here: the header, two Key Responsibilities bullets, four module-map
rows (one deleted, one added), the `SelectionPane` paragraph and the describe paragraph of the
Media-view section, the dataflow diagram's both arms, one error-handling bullet, the vision-call
performance bullet, two dependency bullets, the internal reverse-dependency list, the
test-consumer paragraph, three gotchas (one rewritten, two new), the retired-files and seams
notes, and this log.
