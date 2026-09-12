'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { PhotoMoveBar } from '@/components/admin/PhotoMoveBar'
import { Button } from '@/components/ui'
import {
  folderBreadcrumbs,
  NINA_MEDIA_NODE_LABEL,
  NINA_MEDIA_VIEW_PARAM,
  NINA_MEDIA_VIEW_VALUE,
  type ExplorerView,
} from '@/lib/admin/filetree'
import { cn } from '@/lib/cn'

import { entriesFromDrop, filesFromDropList, filesFromPicker } from './explorer/dropWalk'
import { FolderTree } from './explorer/FolderTree'
import { MediaAdd } from './explorer/MediaAdd'
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
 * ── THE MEDIA VIEW IS THE SAME CHROME OVER A DIFFERENT TABLE ─────────────────────────────────
 * `?view=media` swaps the content pane to the conversation's photographs (`nina_message_images`,
 * both kinds) while the tree, the breadcrumb and the layout stay put — a pinned sibling in the
 * tree, not a route. That is why `view` arrives as a PROP and not as a `useSearchParams` read: the
 * page already awaited the parameter, and a second parse would be a second opinion about the URL.
 * On this view the album's verbs stand down — the drop handlers are not attached, the queue and
 * the move bar are album-only — and the toolbar's Add is the conversation-collection upload
 * (`MediaAdd`), because the verbs a conversation photograph has are not the album's folder verbs.
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
  view,
  mediaCount,
  shareOrigin,
}: {
  userId: string
  folders: readonly ExplorerFolder[]
  photos: readonly ExplorerPhoto[]
  page: ExplorerPageInfo
  /**
   * Which collection the URL has open — the tree's active row, the pager's target and the
   * toolbar's copy all follow it. `app/admin/nina/page.tsx` reads `?view=` and hands it down; this
   * component never parses the parameter itself, for the same reason it never parses `?folder=`.
   */
  view: ExplorerView
  /**
   * How many original conversation photographs exist in total. The tree pane's Media badge shows
   * it on BOTH views, so the album view pays one aggregate for a number its grid never uses — the
   * badge is the rail's whole point, and a badge without a count is decoration.
   */
  mediaCount: number
  /**
   * Phase 7 / R2. Where a "Share link to Nina" link points — `shareOrigin()`'s output, resolved in
   * `app/admin/nina/page.tsx` because `lib/share/origin.ts` is `server-only` and invariant 9
   * forbids a build-time public environment variable for it. Threaded through, UNREAD, to
   * `SelectionPane`; nothing in the explorer itself may substitute `window.location.origin` for it.
   */
  shareOrigin: string
}) {
  const router = useRouter()
  const folder = page.folder

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  /**
   * The folder rail's visibility BELOW `lg`, where the explorer is one column and the rail would
   * otherwise be a hundred rows of chrome sitting on top of the photographs.
   *
   * Closed by default, and that is not a compromise: the breadcrumb directly above already answers
   * "where am I", and the question a file manager gets asked on a 414 px screen is "show me this
   * folder's photos", not "show me the whole tree". Opening it is one tap, and it stays open until
   * it is shut — so a session spent reorganising folders is not a session spent re-opening a
   * drawer.
   *
   * `lg:` classes and NOT a `matchMedia` hook. At and above `lg` the rail is always rendered and
   * this flag is inert, so there is no breakpoint to observe, nothing to hydrate against, and no
   * first frame where the desktop layout is missing a column. The rail also stays in the DOM at
   * every width, which is what keeps `FolderTree`'s expansion overrides and an open `FolderMenu`
   * panel alive across a toggle instead of remounting them.
   */
  const [treeOpen, setTreeOpen] = useState(false)

  /** One sentence about the last media removal that kept a shared blob. Held HERE — the pane
   * unmounts under it — and rendered under the toolbar until the next removal replaces it. */
  const [notice, setNotice] = useState<string | null>(null)

  const isMediaView = view === 'media'

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

  /*
   * The upload hook stays MOUNTED on both views (it is a hook; it cannot be conditional) but the
   * media view never starts it: the album Add buttons are hidden there, the drop handlers are not
   * attached, and the media view's own Add (`MediaAdd`) is a different flow that never touches
   * this hook — so `upload` is idle chrome in media view.
   */
  const upload = useFolderUpload({ userId, destination: folder, onFinished })

  const selected = photos.find((photo) => photo.id === selectedId) ?? null

  /*
   * Focus restoration for the details pane (the 2026-09-12 a11y pass). Every close — the pane's
   * ×, and the unmount that follows a successful remove — takes the focused button with it, and
   * a focused element that leaves the DOM drops the operator on `<body>`, where the next Tab
   * restarts the page. The tile the selection came from takes focus back; a tile that is gone
   * with its row falls back to the content pane itself.
   *
   * Keyed on `selectedId` and never on the derived `selected`: a folder change closes the pane by
   * leaving `selectedId` pointing at a photograph the new page does not hold, and THAT transition
   * must not steal focus from the link the operator just used to navigate.
   */
  const contentRef = useRef<HTMLDivElement | null>(null)
  const lastSelectedId = useRef<string | null>(null)
  useEffect(() => {
    const previous = lastSelectedId.current
    lastSelectedId.current = selectedId
    if (previous == null || selectedId != null) return
    const tile = contentRef.current?.querySelector<HTMLElement>(
      `[data-photo-id="${previous}"]`,
    )
    if (tile != null) tile.focus()
    else contentRef.current?.focus()
  }, [selectedId])

  const hrefFor = useCallback((next: string) => hrefForFolder(next, 1), [])
  /* The pager follows the view: a media page 2 must link to `?view=media&page=2`, not silently
     drop the operator back into the album. */
  const hrefForPage = useCallback(
    (next: number) => (view === 'media' ? hrefForMediaView(next) : hrefForFolder(folder, next)),
    [view, folder],
  )
  /* The tree's Media row always targets page 1 — the same rule the folder rows follow. Built by
     the same grammar family below, so the URL keeps exactly one home even with two arms. */
  const mediaHref = hrefForMediaView(1)

  /**
   * PHASE 6. Folders the operator created in this session, held until a server read names them.
   *
   * They are **durable** — `createNinaAlbumFolderAction` declares them in `nina_folders` and
   * `listNinaAvatarFolders` UNIONs the declarations with the folders the photograph rows imply, so
   * a reload shows an empty folder. This state is not the folder's storage; it is the window
   * between the action resolving and this component receiving a `folders` prop that includes it,
   * during which the tree would otherwise navigate into a folder it cannot draw.
   *
   * The merge below is a filter and not a union: once `folders` from the server names a folder, the
   * pending copy is redundant and must not survive a rename of it.
   */
  const [pendingFolders, setPendingFolders] = useState<readonly string[]>([])

  const addPendingFolder = useCallback((next: string) => {
    setPendingFolders((previous) => (previous.includes(next) ? previous : [...previous, next]))
  }, [])

  /* A flat `string[]`, because `FolderMenu` and `PhotoMoveBar` want destinations without counts.
   * `folders` is `ExplorerFolder[]` (`{ folder, count }`), so this is derived from it rather than
   * spread — and `folders` itself is untouched and still feeds `FolderTree`'s `buildTree`. */
  const allFolders = useMemo(() => {
    const known = new Set(folders.map((entry) => entry.folder))
    return [
      ...folders.map((entry) => entry.folder),
      ...pendingFolders.filter((entry) => !known.has(entry)),
    ].sort()
  }, [folders, pendingFolders])

  /* `hrefFor` builds a URL; a folder operation decides where to go only once the server has
   * answered, so it needs a navigator rather than a link. A folder operation fired while Media is
   * open lands on the folder's ALBUM view — the only place its rows can be drawn. */
  const navigateToFolder = useCallback(
    (next: string) => router.push(hrefFor(next)),
    [router, hrefFor],
  )

  /* Selecting IS opening the pane — there is no separate details toggle: the pane mounts for the
   * selection, and its × hands the selection back (see the render at the bottom of the file). On
   * the media arm the pane is `MediaPane` (SelectionPane dispatches on `isMediaRow`). */
  function select(id: string) {
    setSelectedId(id)
  }

  function onPickFolder(event: React.ChangeEvent<HTMLInputElement>) {
    const walked = filesFromPicker(event.target.files)
    event.target.value = '' // so re-picking the same folder fires change again
    if (walked.length === 0) return
    upload.start(walked)
  }

  function onDragEnter(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    /* Media is a read view in this phase: the drag is absorbed (preventDefault here and in
       onDragOver is what stops the browser navigating away to open the dropped file) but no overlay
       is drawn and no upload starts. Phase 2 migrates the Add flow into this view. */
    if (view === 'media') return
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

    /* Phase 2 owns the media Add flow (carrier-message upload with a dedupe pre-check). Until it
       lands, a drop into Media must not start the FOLDER upload — which would write album rows
       this grid will never show, i.e. bytes the operator cannot see leaving. */
    if (view === 'media') return

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

  /* The album is a drop target; the Media view is not — its upload path is the picker + the
   * browser encode (`MediaAdd`), and a folder walk has nothing to walk onto. */
  const dropHandlers = isMediaView
    ? {}
    : {
        onDragEnter,
        onDragOver,
        onDragLeave,
        onDrop,
      }

  /* Phase 2's `folderBreadcrumbs`: `{ path, name, depth, isCurrent }` per crumb, root first and
   * always present, and `isCurrent` is carried so the last crumb renders as text without this
   * component recomputing which one it is. On the media arm `page.folder` is `''`, so the trail is
   * exactly the Album crumb — and the Media crumb is appended in the JSX below rather than faked
   * into a `FolderCrumb`, because a fake path in the type would be a lie the breadcrumb then had
   * to special-case. */
  const trail = folderBreadcrumbs(folder)

  return (
    <div>
      {/* ── TOOLBAR ─────────────────────────────────────────────────────────────────────────
          Two rows below `lg` — crumbs over controls — and one flex line at `lg`, unchanged from
          what shipped. `lg:contents` on the control group is what buys that: at `lg` the wrapper
          stops generating a box and its five children become direct items of the toolbar's flex
          line again, in the same order, with the same gap. The alternative was a `basis-full
          lg:basis-auto` on the crumbs, which puts `flex` (a shorthand that sets `flex-basis`) and
          `flex-basis` in the same declaration and leaves the winner to Tailwind's emission order —
          and `lib/cn.ts` is a plain join, so there is no merge library to arbitrate that. */}
      <div className="mb-4 space-y-2 lg:flex lg:flex-wrap lg:items-center lg:gap-3 lg:space-y-0">
        <nav aria-label="Breadcrumb" className="min-w-0 lg:flex-1">
          <ol className="flex min-w-0 flex-wrap items-center gap-1 text-[13px] font-medium">
            {trail.map((crumb, index) => (
              <li key={crumb.path} className="flex min-w-0 items-center gap-1">
                {index > 0 && <span className="text-ink-3">/</span>}
                {crumb.isCurrent ? (
                  <span className="truncate font-semibold text-ink" aria-current="page">
                    {crumb.name}
                  </span>
                ) : (
                  /* A crumb is the primary way back up the tree on a phone, so it is a tap target
                     and not a 16 px word. `py-*` and not `TOUCH_ICON`: `truncate` needs a block,
                     and a flex box would make the text an anonymous flex item that `text-overflow`
                     never reaches. On the media arm this is how the operator leaves: the Album
                     crumb links to the album root. */
                  <Link
                    href={hrefFor(crumb.path)}
                    className="block min-w-0 truncate py-3 text-accent"
                  >
                    {crumb.name}
                  </Link>
                )}
              </li>
            ))}
            {/* The media arm's second crumb: Album (link, above) / Media (text). Rendered here and
                not folded into `trail`, because it is not a folder crumb and must never be fed back
                into `hrefFor` as a path. */}
            {view === 'media' && (
              <li className="flex min-w-0 items-center gap-1">
                <span className="text-ink-3">/</span>
                <span className="truncate font-semibold text-ink" aria-current="page">
                  {NINA_MEDIA_NODE_LABEL}
                </span>
              </li>
            )}
          </ol>
        </nav>

        <div className="flex flex-wrap items-center gap-2 lg:contents">
          <span className="shrink-0 text-[12px] font-semibold text-ink-3 tabular-nums">
            {view === 'media'
              ? `${page.total} in ${NINA_MEDIA_NODE_LABEL}`
              : `${page.total} in this folder`}
          </span>

          {!isMediaView && (
            <>
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
            </>
          )}

          {/* The drawer's handle. It does not exist at `lg`, where the rail is a column that is
              always on screen — so `aria-expanded` never lies about a control the operator can
              still see. The toolbar's buttons are icon-only (one row on a 414 px screen), so the
              accessible name is the `aria-label`, never the glyph — the same rule
              `AdminNavLinks.tsx` states for its links. */}
          <Button
            size="md"
            variant="secondary"
            className="lg:hidden"
            aria-expanded={treeOpen}
            aria-controls="admin-folder-rail"
            aria-label={treeOpen ? 'Hide the folders' : 'Show the folders'}
            onClick={() => setTreeOpen(!treeOpen)}
          >
            <PanelLeftIcon className="size-5" />
          </Button>

          {isMediaView ? (
            /* The Media view's "Add photos": the conversation-collection upload flow (browser
             * JPEG encode -> dedupe pre-check -> PUT -> addChatPhotoAction). No folders, no
             * drop-walk — a conversation photograph is not filed. */
            <MediaAdd userId={userId} />
          ) : (
            <>
              <Button
                size="md"
                variant="secondary"
                aria-label="Add photos"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlusIcon className="size-5" />
              </Button>
              <Button
                size="md"
                aria-label="Add a folder"
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderPlusIcon className="size-5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {notice !== null && <p className="mb-4 text-[13px] font-medium text-ink-2">{notice}</p>}

      {/* ── THE COLUMNS ─────────────────────────────────────────────────────────────────────
          Two rails and a canvas at `lg`, exactly as `app/admin/layout.tsx` argued for. ONE column
          below it, in DOM order: rail (hidden unless opened), content, details. R1 revisits F33
          R23's *"this UI is for desktop"* premise, not the desktop layout it produced — the tracks
          at `lg` are the same three, at the same widths. */}
      <div
        className={cn(
          'grid grid-cols-1 items-start gap-4 lg:gap-5',
          selected != null
            ? 'lg:grid-cols-[200px_minmax(0,1fr)_320px]'
            : 'lg:grid-cols-[200px_minmax(0,1fr)]',
        )}
      >
        <div id="admin-folder-rail" className={cn(treeOpen ? 'block' : 'hidden', 'lg:block')}>
          <FolderTree
            folders={folders}
            current={folder}
            view={view}
            hrefFor={hrefFor}
            mediaHref={mediaHref}
            mediaCount={mediaCount}
            allFolders={allFolders}
            onNavigate={navigateToFolder}
            onFolderCreated={addPendingFolder}
          />
        </div>

        {/* The focus anchor for the pane-close restoration above: `tabIndex={-1}` makes it
            reachable only by that fallback (a removed tile's landing pad), never by Tab, and
            `focus:outline-none` keeps the programmatic focus invisible — it is a place to stand,
            not a control. */}
        <div ref={contentRef} tabIndex={-1} className="min-w-0 focus:outline-none" {...dropHandlers}>
          <div
            className={cn(
              'rounded-card border p-4 transition-colors',
              dragging
                ? 'border-accent bg-accent-soft ring-2 ring-accent ring-inset'
                : 'border-rule bg-card',
            )}
          >
            {dragging && (
              <p aria-live="polite" className="mb-3 text-[13px] font-semibold text-ink">
                Drop into {trail.map((crumb) => crumb.name).join(' / ')}
              </p>
            )}

            {/* PHASE 6. Move / remove for the selection — an album verb set (folder move, album
                delete). A media row's Remove is carrier-aware and lives in its pane. */}
            {!isMediaView && (
              <PhotoMoveBar
                selectedId={selected?.id ?? null}
                folders={allFolders}
                folder={folder}
                currentId={photos.find((photo) => photo.isCurrent)?.id ?? null}
                onDone={() => setSelectedId(null)}
              />
            )}

            <PhotoGrid
              photos={photos}
              page={page}
              view={view}
              selectedId={selected?.id ?? null}
              onSelect={select}
              hrefForPage={hrefForPage}
            />
          </div>

          {!isMediaView && (
            <UploadQueue
              phase={upload.phase}
              items={upload.items}
              report={upload.report}
              error={upload.error}
              onDismiss={upload.dismiss}
            />
          )}
        </div>

        {selected != null && (
          <SelectionPane
            photo={selected}
            userId={userId}
            shareOrigin={shareOrigin}
            onClose={() => setSelectedId(null)}
            onRemoved={(note) => {
              setSelectedId(null)
              setNotice(note)
            }}
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

/**
 * The grammar's media arm: `?view=media&page=N`. The KEY comes from `lib/admin/filetree.ts` and the
 * value is matched by `readExplorerView` there, so the writer and the reader of the parameter
 * cannot drift — the same reason `hrefForFolder` and `validateFolderPath` agree by construction.
 * Page 1 is the absence of `?page=`, as in the album arm, so the canonical
 * `/admin/nina?view=media` and a navigated-back-to first page are the same URL.
 */
function hrefForMediaView(page: number): string {
  const params = new URLSearchParams()
  params.set(NINA_MEDIA_VIEW_PARAM, NINA_MEDIA_VIEW_VALUE)
  if (page > 1) params.set('page', String(page))
  return `/admin/nina?${params.toString()}`
}

/*
 * The toolbar's three glyphs, inlined rather than imported — the ruling `AdminNavLinks.tsx`
 * records for its seven, extended to this screen's icons-only toolbar (2026-09-10: the labelled
 * buttons wrapped onto three rows on a 414 px screen): **Lucide** (lucide-static 1.43.0, ISC),
 * fetched from `unpkg.com/lucide-static@latest/icons/<name>.svg` and copied verbatim, with
 * Lucide's `class`/`width`/`height` dropped and `stroke-width` normalised to `strokeWidth` on
 * the root `svg`, where the `stroke*` presentation attributes inherit to every child. Every
 * glyph takes `className` and is `aria-hidden` — the accessible name is the button's
 * `aria-label`, never the picture.
 */

/** The folder rail's drawer handle: a sidebar panel. */
function PanelLeftIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  )
}

/** Add photographs: a picture with a plus. */
function ImagePlusIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 5h6" />
      <path d="M19 2v6" />
      <path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      <circle cx="9" cy="9" r="2" />
    </svg>
  )
}

/** Add a folder: a folder with a plus. */
function FolderPlusIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 10v6" />
      <path d="M9 13h6" />
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  )
}
