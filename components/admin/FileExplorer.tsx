'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { PhotoMoveBar } from '@/components/admin/PhotoMoveBar'
import { Button } from '@/components/ui'
import { folderBreadcrumbs } from '@/lib/admin/filetree'
import { cn } from '@/lib/cn'

import { entriesFromDrop, filesFromDropList, filesFromPicker } from './explorer/dropWalk'
import { FolderTree } from './explorer/FolderTree'
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
  shareOrigin,
}: {
  userId: string
  folders: readonly ExplorerFolder[]
  photos: readonly ExplorerPhoto[]
  page: ExplorerPageInfo
  /**
   * Phase 7 / R2. Where a "Share link to Nina" link points — `shareOrigin()`'s answer, resolved in
   * `app/admin/nina/page.tsx` because `lib/share/origin.ts` is `server-only` and invariant 9
   * forbids a build-time public environment variable for it. Threaded through, UNREAD, to
   * `SelectionPane`; nothing in the explorer itself may substitute `window.location.origin` for it.
   */
  shareOrigin: string
}) {
  const router = useRouter()
  const folder = page.folder

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

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

  const upload = useFolderUpload({ userId, destination: folder, onFinished })

  const selected = photos.find((photo) => photo.id === selectedId) ?? null

  const hrefFor = useCallback((next: string) => hrefForFolder(next, 1), [])
  const hrefForPage = useCallback((next: number) => hrefForFolder(folder, next), [folder])

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
   * answered, so it needs a navigator rather than a link. */
  const navigateToFolder = useCallback(
    (next: string) => router.push(hrefFor(next)),
    [router, hrefFor],
  )

  function select(id: string) {
    setSelectedId(id)
    setDetailOpen(true)
  }

  function onPickFolder(event: React.ChangeEvent<HTMLInputElement>) {
    const walked = filesFromPicker(event.target.files)
    event.target.value = '' // so re-picking the same folder fires change again
    if (walked.length === 0) return
    upload.start(walked)
  }

  function onDragEnter(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
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

  /* Phase 2's `folderBreadcrumbs`: `{ path, name, depth, isCurrent }` per crumb, root first and
   * always present, and `isCurrent` is carried so the last crumb renders as text without this
   * component recomputing which one it is. */
  const trail = folderBreadcrumbs(folder)

  return (
    <div>
      {/* ── TOOLBAR ─────────────────────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
          <ol className="flex min-w-0 flex-wrap items-center gap-1 text-[13px] font-medium">
            {trail.map((crumb, index) => (
              <li key={crumb.path} className="flex min-w-0 items-center gap-1">
                {index > 0 && <span className="text-ink-3">/</span>}
                {crumb.isCurrent ? (
                  <span className="truncate font-semibold text-ink" aria-current="page">
                    {crumb.name}
                  </span>
                ) : (
                  <Link href={hrefFor(crumb.path)} className="truncate text-accent">
                    {crumb.name}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <span className="shrink-0 text-[12px] font-semibold text-ink-3 tabular-nums">
          {page.total} in this folder
        </span>

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

        <Button size="md" variant="secondary" onClick={() => fileInputRef.current?.click()}>
          Add photos
        </Button>
        <Button size="md" onClick={() => folderInputRef.current?.click()}>
          Add a folder
        </Button>
        <Button
          size="md"
          variant="ghost"
          aria-pressed={detailOpen}
          onClick={() => setDetailOpen(!detailOpen)}
        >
          {detailOpen ? 'Hide details' : 'Show details'}
        </Button>
      </div>

      {/* ── THE THREE COLUMNS ───────────────────────────────────────────────────────────── */}
      <div
        className={cn(
          'grid items-start gap-5',
          detailOpen && selected != null
            ? 'grid-cols-[200px_minmax(0,1fr)_320px]'
            : 'grid-cols-[200px_minmax(0,1fr)]',
        )}
      >
        <FolderTree
          folders={folders}
          current={folder}
          hrefFor={hrefFor}
          allFolders={allFolders}
          onNavigate={navigateToFolder}
          onFolderCreated={addPendingFolder}
        />

        <div
          className="min-w-0"
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
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

            {/* PHASE 6. Move / remove for the selection. Returns `null` when nothing is
                selected, so the grid's layout does not shift on an empty selection. */}
            <PhotoMoveBar
              selectedId={selected?.id ?? null}
              folders={allFolders}
              folder={folder}
              currentId={photos.find((photo) => photo.isCurrent)?.id ?? null}
              onDone={() => setSelectedId(null)}
            />

            <PhotoGrid
              photos={photos}
              page={page}
              selectedId={selected?.id ?? null}
              onSelect={select}
              hrefForPage={hrefForPage}
            />
          </div>

          <UploadQueue
            phase={upload.phase}
            items={upload.items}
            report={upload.report}
            error={upload.error}
            onDismiss={upload.dismiss}
          />
        </div>

        {detailOpen && selected != null && (
          <SelectionPane
            photo={selected}
            shareOrigin={shareOrigin}
            onClose={() => setDetailOpen(false)}
            onRemoved={() => setSelectedId(null)}
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
