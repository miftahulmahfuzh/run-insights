# Package: components/admin/explorer

**Location**: `components/admin/explorer`
**Documentation created**: 2026-10-01 (`P2-CAE-A000`, phase 3 of 5 of the numbered-pagination
set), written after reading every source file in the directory and grepping every importer in the
repo. The immediate trigger is that `components/admin/.workflows/package_readme.md:1004` already
**points here** — it documents the three pager mounts it owns and defers `explorer/PhotoGrid.tsx`'s
to this file by name — so until now that pointer was dangling.

**Every count in this file is measured on `feature/numbered-pagination` at 2026-10-01 13:45**
(the working tree with phase 3 applied). Volatile numbers carry their measure date; re-measure
before quoting them forward, and prefer the rule over the number wherever this document states
both. The method, once: `ls`/`wc` over the directory for file counts, `grep -rn` over
`app components lib tests scripts` for importers, `npx vitest run <path>` for test counts.

---

## Overview

`components/admin/explorer` is the inside of **one screen**: `/admin/nina`, the "Image collection"
file manager. `components/admin/FileExplorer.tsx` is the screen's shell — layout, toolbar,
breadcrumb, drop target, the URL grammar, the search/browse branch — and it lives one directory up.
Everything the shell mounts, and every browser-only encode those mounts need, lives here.

The directory is **17 source modules** (14 components + hooks, 3 pure type/helper modules) and
**11 colocated happy-dom suites**, 28 files and 7,892 lines total (measured 2026-10-01).

Three facts organise the whole package, and each one is load-bearing:

1. **One screen, two collections.** `/admin/nina` draws the album (`nina_avatars`) and the Media
   folder (`nina_message_images`) through the *same* grid, the *same* selection pane and the *same*
   describe panel. `model.ts`'s `ExplorerPhoto` is a discriminated union (`origin: 'album' |
   'media'`) and the compiler is what stops album code from assuming a message image. Where the two
   arms genuinely differ, the difference is a *branch at one named place*, not a forked component —
   `SelectionPane` dispatches on `isMediaRow`, `PhotoGrid`'s empty copy and pager label branch on
   `view`, and that is the whole list.

2. **This directory exists because `lib/` cannot hold it.** Vitest runs `environment: 'node'` with
   no jsdom; `lib/admin/`'s promise is that what is in it can be proved. Everything here that is
   not a component is a module that touches `DataTransferItem`, `FileSystemDirectoryReader`,
   `FileList`, `createImageBitmap` or `OffscreenCanvas` — none of which exist in Node. So the
   *decisions* live in `lib/admin/filetree.ts` (is it an image, is the path legal, have we got it
   already) and are unit-tested there, and the *browser plumbing* lives here and decides nothing.
   `dropWalk.ts`'s header states this as the directory's organising rule.

3. **Four client encode paths, and they do not share constants.** `thumbnail.ts`,
   `chatPhotoUpload.ts`, `avatarUpload.ts` and `searchQueryImage.ts` each decode a `File` in the
   browser. Each declares its own short/long edge and quality **locally**, and that is a standing
   ruling, not an oversight: *a constant is shared when it is AGREED ON*, and nothing on the server
   re-encodes anything, so no server module has an opinion about any of these numbers. The only
   three things that genuinely cross the boundary are the pathname builders, the declared content
   type, and the byte caps Blob enforces at PUT time.

**Key responsibilities:**

- Draw one folder's page of photographs (`PhotoGrid`) and one ranked search answer
  (`SearchResultsGrid`) in the borderless-sheet idiom.
- Draw the folder rail with subtree counts and the pinned Media row (`FolderTree`).
- Draw the details rail for whichever arm the selected row came from (`SelectionPane` →
  `MediaPane`), including the one describe/keywords panel both arms mount (`PhotoDescription`).
- Own every browser-side encode and upload the screen needs, and own none of the decisions about
  them.
- Own the Server→client props contract for the screen (`model.ts`), which `app/admin/nina/page.tsx`
  imports directly and `FileExplorer.tsx` re-exports.

---

## Module map

Every module is `'use client'` except the three marked **directive-free** — those compile into
whichever graph imports them, which is why `app/admin/nina/page.tsx` (a Server Component) can
import `model.ts` without dragging a client module in with it.

| File | Kind | Purpose |
|---|---|---|
| `model.ts` | **directive-free, types only** | The Server→client contract. `ExplorerPhoto = AlbumExplorerPhoto \| MediaExplorerPhoto`, discriminated by `origin`. `ExplorerFolder`, `ExplorerPageInfo`, `QueueItem`, `QueueReport`. No runtime export at all. |
| `dropWalk.ts` | **directive-free**, browser APIs | `webkitGetAsEntry()` capture and the `readEntries` pump; the `webkitdirectory` picker. Both gestures end as the same `WalkedFile[]`. `EXPLORER_WALK_MAX_FILES = 2000`, `EXPLORER_WALK_MAX_DEPTH = 12`. Forms no opinion. |
| `thumbnail.ts` | **directive-free**, browser APIs | One decode → intrinsic size out, plus a 256 px short-edge JPEG (`EXPLORER_THUMB_QUALITY = 0.82`). The derived thumbnail is this repo's answer to image optimisation for Blob-hosted photos. |
| `avatarUpload.ts` | `'use client'` | A picked file → `nina/<userId>/avatar-<id>.<ext>`. The one upload path that **never re-encodes** — the file's own container, dimensions and `file.type` go up unchanged. |
| `chatPhotoUpload.ts` | `'use client'` | The encode both Media flows share: decode once, 1024 px long edge (`NINA_IMAGE_HEIGHT`), q0.9, hash the **encoded** blob before the PUT. `opts.dedupe` is opt-in; `MediaAdd` is its only caller. |
| `searchQueryImage.ts` | `'use client'` | The one encode in this folder that does **not** PUT: 768 px short edge, q0.75, out as a data URI capped at 700,000 chars. A query image is a question, not a photograph the album is gaining. |
| `useFolderUpload.ts` | `'use client'` hook | One gesture end to end: walk → manifest → `planFolderUpload` diff → four-lane bounded-concurrency upload → chunked register. `EXPLORER_REGISTER_CHUNK = NINA_ADMIN_BATCH_MAX`. |
| `FolderTree.tsx` | `'use client'` | The folder rail. Every row is a `<Link>` (real navigation — changing folder changes which rows exist). Expansion is `override[path] ?? onPath.has(path)`. The count column is subtree `totalCount`. Carries the pinned Media row and one `FolderMenu` per row. |
| `PhotoGrid.tsx` | `'use client'` | One page of square tiles, the `{first}–{last} of {total}` count line, and the numbered pager. View-aware in exactly three copy places: empty title, empty description, pager label. **This phase's file — see "The pager" below.** |
| `SearchResultsGrid.tsx` | `'use client'` | The ranked answer as one sheet — `PhotoGrid`'s recipe mirrored with three deliberate differences (no pager, no selection pane, and *where* the photograph lives baked into the accessible name). Opens `components/ui/PhotoViewer` scoped to the result set. |
| `PhotoSearchBar.tsx` | `'use client'` | The album search row. Owns only the DRAFT; a landed search leaves through `onResults`. Reads no field of a hit. Mounted on the album arm only. |
| `SelectionPane.tsx` | `'use client'` | The details rail, as a two-line dispatcher on `isMediaRow`: album rows render the private `AlbumSelectionPane`, media rows render `MediaPane`. One `flex-wrap` icon row, no text labels, destructive last. |
| `MediaPane.tsx` | `'use client'` | One Media row in full — the purged `/admin/photos` rail re-hosted. Adoption draft framing (the `worn` latch), the prompt brush **inside** the `photo.prompt != null` conditional, `MediaControls` in the icon row. Also exports the `isMediaRow` type guard. |
| `MediaControls.tsx` | `'use client'` | Replace and Remove for one media row, as a **fragment** so the pane's icon row is their flex parent. No confirmation. A remove's `note` goes UP via `onRemoved`. |
| `MediaAdd.tsx` | `'use client'` | The Media toolbar's "Add photos": encode → dedupe pre-check → PUT → `addChatPhotoAction` on a minted carrier message. Sequential `for` loop, never `Promise.all`. |
| `PhotoDescription.tsx` | `'use client'` | THE one describe control, mounted by both arms, plus the search-keyword and negative-keyword boxes. Imports **no server action** — the host hands in four closures. SAVE button, never commit-on-blur. |
| `UploadQueue.tsx` | `'use client'` | The upload's one honest sentence — *"Nothing new. All 313 files are already here."* `REFUSAL_TEXT` is an exhaustive `Record` over `UploadRefusal`, so a new refusal reason is a build error here until it has words. |

---

## The two-arm union (`model.ts`)

`ExplorerPhotoBase` types the fields every row has. Four of them — `thumbUrl`, `folder`,
`isCurrent`, `crop` — **vary** between the arms and are typed generally in the base, then narrowed
on the media arm:

- `MediaExplorerPhoto.thumbUrl` is the literal `null` (`nina_message_images` has no thumbnail
  column), so a media tile loads the original.
- `MediaExplorerPhoto.isCurrent` is the literal `false`. Adoption mints an `nina_avatars` row and
  *that* row carries the flag.
- `AlbumExplorerPhoto` adds `isPointer: boolean` — the boolean, never the linked id.
- Both arms carry `searchKeywords` / `negativeSearchKeywords`: still one pair per arm, because they
  are two columns on two tables with two write paths, and a reader that skipped the `origin`
  narrowing would not know which action it may call.

The rule that falls out: **a consumer reading a general field off the union compiles either way; a
consumer reading an arm-only field must narrow on `origin` first.** That narrowing is the
compiler refusing to let album code assume a message image, and it is the reason `SelectionPane`'s
dispatch is two lines and neither arm below it reads `origin` again.

`ExplorerPageInfo` is offset-based rather than keyset, deliberately: a file manager's pager says
*"121–240 of 314"*, which a cursor cannot answer. The one accepted cost is written into that type's
docstring — a tile can repeat across two consecutive pages *during* an upload; nothing is ever
skipped.

---

## The pager — the shared numbered control (2026-10-01, `P2-CAE-A000`)

`PhotoGrid.tsx` renders **`components/ui/Pagination`** and nothing else. It replaced a
`‹ Newer` / `Older ›` two-ended stepper this file wrote by hand — the same stepper
`app/admin/error-logs/page.tsx` had then copied by hand, which is how five surfaces ended up with
three copy grammars. The runner's own reason for the sweep: page 7 of an album was six taps from
page 1.

```tsx
<div className="mt-4 flex flex-col items-center gap-2 border-t border-rule pt-3">
  <span className="text-[12px] font-semibold text-ink-2 tabular-nums">
    {first}&ndash;{last} of {page.total}
  </span>
  <Pagination
    page={page.page}
    pageCount={pageCount}
    hrefForPage={hrefForPage}
    label={view === 'media' ? 'Media pages' : 'Folder pages'}
  />
</div>
```

Five rules, each of which has already been argued once and should not be re-argued:

1. **The count line stays, and it stays *above* the numbers.** A row of numbers says where you can
   go; it cannot say how many rows there are. This grid has answered both questions since it was a
   file manager, and the swap kept the `border-t border-rule pt-3` rule and the range line
   untouched. What changed around them is `justify-between` → `flex-col items-center`: the stepper
   needed the range *between* its two ends, the numbered row stacks under it.

2. **There is deliberately NO outer `pageCount <= 1` guard here.** `Pagination` returns `null` at
   `pageCount <= 1` on its own, so a single-page folder renders the rule, the count line, and
   nothing under it — the `gap-2` collapses with it. Wrapping the whole block in a guard would take
   the count line away at exactly the moment a one-page folder still wants to say *"1–7 of 7"*.
   This is a bound decision of the plan set: the four admin surfaces get no outer guard; only
   `/nina/about` keeps one, for its own reason.

3. **`pageCount` is the control's own definition of the word, verbatim** —
   `Math.max(1, Math.ceil(total / pageSize))`, always ≥ 1, so an empty folder still has a page 1.
   The local was called `lastPage` under the stepper and was renamed in this phase so the name at
   the call site and the name in the prop are the same word.

4. **`label` branches on `view`, and that is not decoration.** One component draws both arms of
   `/admin/nina`, so the `<nav>` has to say which collection it walks: `'Media pages'` /
   `'Folder pages'`. Both tests and the accessible-name assertions key on those exact strings.

5. **`hrefForPage` is handed straight through.** `FileExplorer` already decides whether a page link
   carries `?view=media` or `?folder=`, and this component has never known. Do not build a URL
   here.

**`TOUCH_ICON` is gone from this file's executable lines and must stay gone.** The 44 px tap floor
now comes from `Pagination`'s own `CELL` class string. `components/ui` may not import
`components/admin` — the UI barrel is a client-safe bundle boundary and that direction is an
inverted dependency — so the two modules spell the same 44 px minimum independently, on purpose.
`next/link` left with it; the grid holds no `<Link>` of its own any more.

Note the asymmetry inside this directory: **five sibling modules still import `TOUCH_ICON`**
(`FolderTree`, `MediaPane`, `SelectionPane`, `PhotoSearchBar`, `UploadQueue`; measured
2026-10-01). Admin-scoped modules importing an admin-scoped constant is correct. Only `PhotoGrid` dropped it, because only `PhotoGrid` handed its tap targets to a `ui`
component.

### The grep trap this file sets

`PhotoGrid.tsx`'s header docblock *cites* `Newer`, `Older`, `rel="prev"`, `TOUCH_ICON` and
`next/link` by name, in order to record what was replaced and why. A naive
`grep -l 'TOUCH_ICON' PhotoGrid.tsx` therefore still hits. `tests/admin.photoGrid.test.ts` asserts
all five absences against **`codeLines(grid)`**, not the raw source — the comment-stripping helper
whose rule is `scripts/check-client-secret-boundary.mjs`'s `isComment` plus `{/*` for a JSX
comment's opening line. **This is why every JSX comment in this component starts its continuation
lines with `*`**: a comment can then never satisfy or trip a source assertion. Keep that spelling
in any comment added to this file.

---

## Dataflow

### Browsing (the default path)

```
app/admin/nina/page.tsx  (Server Component, force-dynamic)
  └─ reads nina_avatars (folder + offset) or nina_message_images
  └─ shapes ExplorerPhoto[] / ExplorerFolder[] / ExplorerPageInfo   ← model.ts
      └─ FileExplorer.tsx  (shell; owns the URL grammar + selection state)
          ├─ FolderTree      ← ExplorerFolder[]   → <Link> navigation, ?folder=
          ├─ PhotoGrid       ← ExplorerPhoto[] + ExplorerPageInfo
          │     → onSelect(id)  (useState in the shell, NOT the URL)
          │     → Pagination    (hrefForPage from the shell)
          └─ SelectionPane   ← the selected ExplorerPhoto
                ├─ album row → AlbumSelectionPane (private) → PhotoDescription
                └─ media row → MediaPane → MediaControls + PhotoDescription
```

The two state homes on this screen are deliberately different and sit side by side:
**folder is in the URL** (changing it changes which rows exist, which is a server read by
definition — `FolderTree` uses `<Link>`), **photo selection is in `useState`** (it changes nothing
the server knows, so it follows `components/ui/usePanelParam`'s reasoning instead).

No module here keeps an optimistic copy of the album. Every action ends in
`revalidatePath('/admin/nina')`, the page is `force-dynamic`, and Next 16 returns the re-rendered
RSC payload in the action's own response — so there is no `router.refresh()` anywhere in this
directory and nothing to keep in sync.

### Uploading a folder

```
drop / picker gesture
  └─ dropWalk.ts        entriesFromDrop → walkEntries → WalkedFile[]   (decides nothing)
      └─ useFolderUpload.ts
           1. listNinaAlbumManifestAction()          what the album already has
           2. planFolderUpload(walked, manifest)     lib/admin/filetree — the ONLY decider
           3. setItems / setReport                   decide, set, run (F17's purity rule)
           4. four lanes: measureAndThumbnail → PUT original → PUT thumb
           5. registerNinaAvatarsAction in EXPLORER_REGISTER_CHUNK batches
      └─ UploadQueue.tsx  renders phase + items + report
```

Two rules carried forward with their measurements:

- **Nothing decides inside a `setState` updater.** `reactStrictMode: true` double-invokes updaters
  in dev; `docs/plans/archive/F17-onpick-purity.md` measured one picked file minting **two** upload
  tokens and writing **two** blobs, one orphaned forever. `run()` gathers, awaits, calls one pure
  function, sets values, *then* starts effects.
- **Four lanes, not `Promise.all`.** Three hundred files under `Promise.all` is three hundred
  token-mint requests, three hundred simultaneous PUTs and three hundred decoded bitmaps alive at
  once. Four saturates a home upstream link, bounds memory, and makes the progress line mean
  something. Per-file failure marks that item `error` and the lane moves on.

### Searching

```
PhotoSearchBar  (album arm only)
  └─ searchQueryImage.ts  → data URI (NO PUT, no blob, no orphan)
  └─ searchNinaAvatarsAction(text, dataUri?)   one action, both tables, deduplicated
      → onResults(AlbumSearchState)  up to FileExplorer
          → FileExplorer swaps the content pane to SearchResultsGrid
              → tile click → components/ui/PhotoViewer, scoped to hits[]
```

`?folder=` is **not** sent. The complaint the search answers is *"I am struggling to see the image
I want"*, which is not a complaint about one folder — it is not knowing which folder, and since
2026-09-17 not knowing which *table* either. The search is wide on purpose.

---

## Dependencies

### External packages

| Package | Used by | Why |
|---|---|---|
| `@vercel/blob/client` | `avatarUpload`, `chatPhotoUpload`, `useFolderUpload` (and `MediaControls` via `uploadChatPhoto`) | Client-side `upload()` through `handleUploadUrl: '/api/admin/nina/upload'` — the token is minted server-side, the bytes never pass through the Next server. |
| `next/link` | `FolderTree`, `SearchResultsGrid` | Real navigation for folder rows; a middle-clickable jump link in the search viewer's header. **Not** `PhotoGrid` any more. |
| `react` | the client components | `useState` / `useRef` / `useCallback` / `useMemo` / `useTransition`. |

### Internal (`@/lib`)

- `@/lib/admin/filetree` — `planFolderUpload`, `LocalFileLike`, `UploadRefusal`, `ExplorerView`,
  the media-view labels. **The decision layer this package deliberately has none of.**
- `@/lib/admin/ninaAlbumActions` — the album's Server Actions (manifest, register, describe, move,
  remove, search).
- `@/lib/admin/chatPhotoActions` / `chatPhotoKeywordActions` / `chatPhotos` — the Media arm's twin
  set, plus the pathname builder and content type.
- `@/lib/admin/avatars` — pathname builders, `extForContentType`, the byte/edge caps.
- `@/lib/admin/imageReferenceActions`, `albumDeepLink`, `schema` — the anchor verb, the share link,
  the Zod boundary.
- `@/lib/photos/contentHash`, `@/lib/photos/resizeTarget`, `@/lib/nina/crop`, `@/lib/nina/album`,
  `@/lib/id`, `@/lib/cn`, `@/lib/db/schema` (one type).

### Internal (`@/components`)

- `@/components/ui` — `Button`, `ButtonLink`, `EmptyState`, `Field`, `PhotoViewer`, `useSavePhoto`,
  and since this phase **`Pagination`**.
- `@/components/admin` — `CropStudio`, `CircleFrame`, `FolderMenu`, `ShareToNinaItem`,
  `photoIcons`, `touch`. All five of these are the parent directory reaching *down* only in the
  sense that this directory reaches *up* for them; `components/admin` is the layer above and that
  direction is fine. The direction that is **not** fine is `components/ui` → `components/admin`.

---

## Reverse dependencies

Measured 2026-10-01 over `app components lib tests scripts`.

**Primary consumer — `components/admin/FileExplorer.tsx`.** It imports ten of the seventeen
modules (`dropWalk`, `FolderTree`, `MediaAdd`, `PhotoGrid`, `PhotoSearchBar`, `SearchResultsGrid`,
`SelectionPane`, `UploadQueue`, `useFolderUpload`, `model`) and **re-exports** `ExplorerFolder`,
`ExplorerPageInfo` and `ExplorerPhoto` so a consumer needs one import path. It is the only module
that mounts any component in this directory.

**Secondary consumers:**

- `app/admin/nina/page.tsx` — imports `model.ts`'s types directly (the Server Component builds the
  rows). The only `app/` importer.
- `components/admin/PhotoshopDetail.tsx` — imports `uploadAvatarPhoto` and `uploadChatPhoto`, the
  two upload functions, for its manual Replace button. The one consumer outside the explorer
  screen, and the reason those two modules are exported functions rather than hook internals.

**Test consumers (source-text readers, invisible to the import graph):**

- `tests/admin.photoGrid.test.ts` — `readFileSync`s `PhotoGrid.tsx` and asserts over `codeLines`.
- `tests/admin.photoSearch.test.ts` — reads `PhotoSearchBar.tsx`, `SearchResultsGrid.tsx` and
  `searchQueryImage.ts`, and pins the four `SEARCH_QUERY_*` constants by their source text. **This
  is why those four stay `export`ed** despite knip flagging them: no import graph shows that
  reader, and dropping `export` would silently desync the pinned numbers.
- `tests/admin.mediaPane.test.ts` — reads `MediaPane.tsx`, `MediaControls.tsx`, `MediaAdd.tsx`,
  `SelectionPane.tsx`, and asserts `MediaDescription.tsx` does **not** exist (the retired interim
  seam).
- `tests/admin.chatPhotos.test.ts` — the one test that imports a value (`ADMIN_CHAT_PHOTO_LONG_EDGE_PX`),
  to assert it equals `NINA_IMAGE_HEIGHT`.

---

## Tests

| Where | Files | Tests | Environment |
|---|---|---|---|
| `components/admin/explorer/*.test.tsx` | 11 | 172 | happy-dom (`// @vitest-environment happy-dom`, `.test.tsx` only) |
| the four repo-level suites above | 4 | 153 | node, source-text scans |

Both measured 2026-10-01 on `feature/numbered-pagination`; both green.

Six source modules have **no colocated suite**, and that is the design rather than a gap:
`model.ts` (types only, nothing to run), `dropWalk.ts`, `thumbnail.ts`, `searchQueryImage.ts`,
`chatPhotoUpload.ts`, `avatarUpload.ts` (all four are browser-API plumbing that decides nothing —
the decisions they feed are tested in `lib/admin/filetree`, and their *constants* are pinned by the
source-text suites). If a module here starts making a judgement, that judgement belongs in `lib/`,
not in a new suite here.

Harness rules that bite in this directory (all recorded from real failures):

- `.test.tsx` **only** gets happy-dom. A `.test.ts` beside a component runs in node and will not
  render.
- `afterEach` runs in **reverse** order; a pending action across cleanup poisons the next mount.
- `userEvent` hangs under vitest fake timers — use `fireEvent` plus act-wrapped
  `advanceTimersByTimeAsync`.
- React 19 settles an async transition in **two commits**: results render, then `isPending` flips.
  A `waitFor` can see a still-disabled control, and typing into it is silently dropped — gate on
  `toBeEnabled()` before re-typing.
- Class **order** is never asserted. `prettier-plugin-tailwindcss` owns it, and a test that fights
  the formatter is a test that gets deleted. Where two utilities must be adjacent to be matchable
  (`rounded-pill bg-ink`), the shape asserted is one the sorter already produces.

---

## Gotchas and anti-patterns

- **Do not add an outer `pageCount <= 1` guard to `PhotoGrid`'s footer.** It would hide the count
  line on a one-page folder. `Pagination` already self-guards. (See the pager section.)
- **Do not re-introduce `TOUCH_ICON` or `next/link` into `PhotoGrid`'s executable lines.** Both are
  asserted absent by `tests/admin.photoGrid.test.ts` against `codeLines`, and both only ever
  existed for the stepper.
- **Do not write a local `aria-current` in `PhotoGrid`.** The active-page semantics belong to
  `components/ui/Pagination`; a second spelling is pinned against.
- **Do not add a second upload path to this screen.** Two upload paths in one screen is how the two
  that exist got their separate reasons — `useFolderUpload` is the folder gesture, `MediaAdd` is
  the Media toolbar, `PhotoshopDetail` reuses the two primitives. A third needs to reuse
  `chatPhotoUpload` / `avatarUpload`, not grow its own encode.
- **Do not put a judgement in this directory.** If you find yourself writing "is this path legal",
  "is this an image", "have we got it already" — that is `lib/admin/filetree.ts`'s, where it can be
  proved under `environment: 'node'`.
- **Do not unify the four encode constants.** They look like duplication and they are not: see
  Overview rule 3, and `thumbnail.ts`'s header, which records a reconciler *deleting* a draft
  constant that named the same thing with a different value and different semantics.
- **Do not use `next/image` on these blobs.** It re-optimises finished files on a paid transform
  quota. `thumbnail.ts` is this repo's answer, written at upload time rather than bought per
  request. Every `<img>` here carries the eslint disable and a pointer to the ruling.
- **Do not confirm anything.** *"i am the only one using this app, no need for all these bullshit
  confirmation"* — Remove acts on click, Replace opens the picker on click. The `busy` states exist
  only to stop a double-click firing two uploads, which is a different thing.
- **A `SearchResultsGrid` tile has no `data-photo-id`.** That attribute is `FileExplorer`'s
  pane-close focus hook, and this grid opens no pane.

---

## Known documentation drift (as of 2026-10-01)

`model.ts`'s `ExplorerPageInfo` docstring still reads *"a file manager's pager says '121–240 of
314' and offers Newer as well as Older"*. The first half is still true and is the live reason the
type is offset-based; **the second half describes the stepper this phase deleted.** The claim it
supports (offsets over a keyset cursor) is unaffected either way. Left in place because `model.ts`
is not in this phase's file set — fix it in the next change that legitimately touches that file,
and the surrounding paragraph about a tile repeating across two pages during an upload stays
exactly as it is.

`components/admin/.workflows/package_readme.md`'s module map still describes
`explorer/PhotoGrid.tsx` as *"One page of square tiles + the '121–240 of 314' pager"* — accurate,
and now underspecified; that file's own pagination section correctly defers here.

---

## Historical context

- **F33 and the image-collection set (2026-09-10 → 09-12)** built this directory out of the purged
  `AlbumManager` and `/admin/photos` surfaces. `AlbumManager`'s framing half moved into
  `SelectionPane` unmodified; `ChatPhotoDetail` / `ChatPhotoProfilePicture` / `ChatPhotoControls` /
  `ChatPhotoAdd` became `MediaPane` / `MediaControls` / `MediaAdd`. The explicit rule at the time:
  re-host, do not re-litigate.
- **R3, 2026-09-10** unified the describe story into one `PhotoDescription` mounted by both arms,
  and retired the interim `MediaDescription.tsx` seam (`tests/admin.mediaPane.test.ts` asserts the
  file is gone).
- **2026-09-12** — a knip sweep un-exported 5 dead exports in this directory the same day.
  `searchQueryImage.ts`'s four constants survived it with a symbol-level note explaining their
  invisible reader; that note is the pattern to follow rather than a suppression.
- **media-album-unified-search R1, 2026-09-17** widened the search to rank `nina_avatars` and
  `nina_message_images` together. `PhotoSearchBar` was unchanged by it — it reads no field of a hit
  — which is the clearest evidence that the draft/results split is in the right place.
  `SearchResultsGrid` gained the `in Media` label arm.
- **2026-09-17 (R3)** changed what adoption writes: `setChatPhotoAsAvatarAction` now mints an
  `nina_avatars` row that *points* at the message image rather than copying its bytes. `MediaPane`
  was unchanged — it still hands over the same three crop numbers.
- **2026-10-01, `P2-CAE-A000`** (this document's creation) replaced `PhotoGrid`'s hand-written
  stepper with `components/ui/Pagination`, phase 3 of the five-phase numbered-pagination set
  satisfying R1 (*every* Previous/Next pager in the app becomes the shared numbered control).
  Phase 1 wrote the control; phases 2, 4 and 5 adopted it at `/nina/about`,
  `components/admin/PhotoReferencePicker` + `PhotoshopPickerGrid`, and
  `app/admin/error-logs/page.tsx`. No drift: all three files in this phase matched the plan's quoted
  code byte-for-byte.
