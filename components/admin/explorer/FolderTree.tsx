'use client'

import Link from 'next/link'
import { useMemo, useState, type ReactNode } from 'react'

import { FolderMenu } from '@/components/admin/FolderMenu'
import { TOUCH_ICON } from '@/components/admin/touch'
import {
  buildTree,
  folderAncestors,
  mediaViewNode,
  type ExplorerView,
  type FolderNode,
} from '@/lib/admin/filetree'
import { cn } from '@/lib/cn'

import type { ExplorerFolder } from './model'

/**
 * The folder rail — *"make the photos much more structured and easier to maintain"*, made
 * navigable.
 *
 * ── EVERY ROW IS A `<Link>`, AND THAT IS THE OPPOSITE OF `usePanelParam` ────────────────────
 * `components/ui/usePanelParam.ts` argues at length for `window.history.pushState` over
 * `router.push`, because `/me`'s open panel is client state and re-running six database reads for it
 * would be waste. **Here the reasoning inverts.** Changing folder changes *which rows exist*: the
 * page must re-run `listNinaAvatarsInFolder` for the new folder and the new offset, and that is a
 * server read by definition. So `<Link>`, real navigation, `?folder=` in the URL — which also makes
 * a folder deep-linkable and the back button meaningful, both of which a file manager owes its user.
 *
 * Selection of a PHOTO is the other case and is held in `useState` for exactly `usePanelParam`'s
 * reason. The two live side by side on this screen on purpose.
 *
 * ── EXPANSION IS A DEFAULT PLUS AN OVERRIDE, NEVER DERIVED STATE ────────────────────────────
 * A node is open when it is on the path to the current folder — computed from props, so navigating
 * reveals the destination with no effect and no state to sync. A chevron writes an override for
 * that one node. `override[path] ?? onPath.has(path)` is the whole rule, which is why there is no
 * `useEffect` here copying props into state and no bug where the tree forgets where you are.
 *
 * ── THE COUNTS ARE THE POINT OF THE COLUMN ──────────────────────────────────────────────────
 * `totalCount`, right-aligned, `tabular-nums`. *"i will put hundreds of profile pics in there"* is
 * the requirement, so "how many are under here" is the question this rail answers on every row at a
 * glance, and a right-aligned monospaced-figure column is the only way a column of them reads as
 * comparable rather than as decoration.
 *
 * The distinction matters and phase 2's names carry it: `ownCount` is what is filed directly in a
 * folder, `totalCount` includes every descendant, and a COLLAPSED folder reading "0" while holding
 * two hundred photos two levels down is the specific thing that makes a tree pane useless. So the
 * column is `totalCount` at every depth, root included.
 */

export function FolderTree({
  folders,
  current,
  view,
  hrefFor,
  mediaHref,
  mediaCount,
  allFolders,
  onNavigate,
  onFolderCreated,
}: {
  folders: readonly ExplorerFolder[]
  /** `''` is the album root. Unread while `view` is `'media'` — no folder is open then. */
  current: string
  /**
   * Which collection is open. The active-row test is `view === 'album' && current === path`, and
   * the `view` half is not decoration: Media and the album root SHARE the path value `''`, so a
   * path-only test would highlight "Album" while Media's grid is on screen.
   */
  view: ExplorerView
  /** Built by `FileExplorer` so the URL grammar has one home. Folder rows only. */
  hrefFor: (folder: string) => string
  /** The Media row's href — the same grammar's other arm, also built by `FileExplorer`. A plain
   * string and not a callback, because a view has no path to rebuild it around. */
  mediaHref: string
  /** How many photographs the Media view holds in total — the pinned row's badge. */
  mediaCount: number
  /**
   * PHASE 6. Every folder path the album knows about — the server's list merged with the ones
   * created in this session. `FolderMenu`'s "Move to…" universe and its collision hint, which is
   * why it is a flat `string[]` and not the `{ folder, count }` rows `buildTree` reads.
   */
  allFolders: readonly string[]
  /**
   * PHASE 6. `hrefFor` builds a URL; this navigates to one. A folder operation lands on the server
   * and *then* decides where the explorer should be looking, so the menu cannot express that as a
   * `<Link>` written before the click.
   */
  onNavigate: (folder: string) => void
  /** PHASE 6. A folder the server just declared, so it joins the tree before the next read. */
  onFolderCreated: (folder: string) => void
}) {
  /*
   * `buildTree` returns ONE root node, not an array — phase 2's shape, reconciled from the draft's
   * `FolderNode[]`. That is the better shape here and it deletes code: the root's label, its
   * subtree total and whether it has anything to expand all come off the node instead of being
   * recomputed in this component (the draft summed `folders` by hand for the root's count, which
   * was a second opinion about a number `totaliseFolderNode` had already worked out).
   *
   * `ExplorerFolder` is `{ folder: string; count: number }`, which is structurally phase 2's
   * `FolderCount` — so it goes straight in with no mapping. MEDIA is not in this call: the pinned
   * node is built separately below, because putting it through `buildTree` would hand it a path
   * and make it a folder — the exact thing the view must not be.
   */
  const root = useMemo(() => buildTree(folders), [folders])
  const albumOpen = view === 'album'
  /* Expansion follows the open FOLDER only. On the media arm nothing is "on the path", so the tree
     renders collapsed — the operator's place is a view, not a node, and no folder should pretend
     otherwise. */
  const onPath = useMemo(
    () => new Set(albumOpen ? [...folderAncestors(current), current] : []),
    [albumOpen, current],
  )
  const [override, setOverride] = useState<Record<string, boolean>>({})

  /* The per-folder menu, built here so `Row` stays a pure row-drawer. The MEDIA row passes
     `menu={null}`: a view has no folder verbs, and a menu on it would offer to rename or delete
     something that cannot exist. */
  const folderMenu = (path: string, photoCount: number) => (
    <FolderMenu
      folder={path}
      folders={allFolders}
      photoCount={photoCount}
      onNavigate={onNavigate}
      onFolderCreated={onFolderCreated}
    />
  )

  /* `mediaViewNode` clamps and names; the component only renders what it is told. */
  const media = mediaViewNode(mediaCount)

  return (
    <nav aria-label="Folders" className="rounded-card border border-rule bg-card p-3">
      <p className="mb-2 px-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
        Folders
      </p>

      <Row
        href={hrefFor('')}
        label={root.name}
        count={root.totalCount}
        depth={0}
        active={albumOpen && current === ''}
        chevron={root.children.length > 0 ? 'open' : 'none'}
        onToggle={undefined}
        menu={folderMenu('', root.totalCount)}
      />

      <ul className="mt-0.5">
        {root.children.map((node) => (
          <Branch
            key={node.path}
            node={node}
            depth={1}
            current={current}
            albumOpen={albumOpen}
            onPath={onPath}
            override={override}
            setOverride={setOverride}
            hrefFor={hrefFor}
            allFolders={allFolders}
            onNavigate={onNavigate}
            onFolderCreated={onFolderCreated}
          />
        ))}

        {/* The pinned virtual sibling — the user's "posisinya dibawah folder Album". LAST of the
            root's children, because the requirement put Media BELOW the album, and first would
            make it read as one more folder. `MediaViewNode` guarantees it carries no `path` and no
            `children`, so the only thing this row can do is navigate — no chevron, no menu, no
            subtree, and nothing for `FolderMenu` or `findFolderNode` to be wrong about. */}
        <li>
          <Row
            href={mediaHref}
            label={media.name}
            count={media.count}
            depth={1}
            active={view === 'media'}
            chevron="none"
            menu={null}
          />
        </li>
      </ul>

      {/* SEAM — PHASE 6, TAKEN. The folder-maintenance affordances landed in `Row` below rather
          than as a separate "New folder" button under this nav: `FolderMenu` carries all four
          verbs, and putting **New subfolder** inside the per-folder menu means the parent is the
          folder whose menu was opened rather than whichever folder the rail happens to have
          selected — one fewer thing for the operator to check before clicking. The root's own Row
          renders the menu too, with only that one item, which is where a top-level folder is
          created. The Media row renders none: a view is not a folder and gets no folder verbs. */}
    </nav>
  )
}

function Branch({
  node,
  depth,
  current,
  albumOpen,
  onPath,
  override,
  setOverride,
  hrefFor,
  allFolders,
  onNavigate,
  onFolderCreated,
}: {
  node: FolderNode
  depth: number
  current: string
  /* Forwarded so every level's active test carries the `view` half, not just the root's. */
  albumOpen: boolean
  onPath: ReadonlySet<string>
  override: Record<string, boolean>
  setOverride: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  hrefFor: (folder: string) => string
  /* PHASE 6, forwarded through the recursion exactly as `hrefFor` already is. */
  allFolders: readonly string[]
  onNavigate: (folder: string) => void
  onFolderCreated: (folder: string) => void
}) {
  const hasChildren = node.children.length > 0
  const open = override[node.path] ?? onPath.has(node.path)

  return (
    <li>
      <Row
        href={hrefFor(node.path)}
        label={node.name}
        count={node.totalCount}
        depth={depth}
        active={albumOpen && current === node.path}
        chevron={hasChildren ? (open ? 'open' : 'closed') : 'none'}
        onToggle={
          hasChildren
            ? () => setOverride((previous) => ({ ...previous, [node.path]: !open }))
            : undefined
        }
        menu={
          <FolderMenu
            folder={node.path}
            folders={allFolders}
            photoCount={node.totalCount}
            onNavigate={onNavigate}
            onFolderCreated={onFolderCreated}
          />
        }
      />
      {hasChildren && open && (
        <ul>
          {node.children.map((child) => (
            <Branch
              key={child.path}
              node={child}
              depth={depth + 1}
              current={current}
              albumOpen={albumOpen}
              onPath={onPath}
              override={override}
              setOverride={setOverride}
              hrefFor={hrefFor}
              allFolders={allFolders}
              onNavigate={onNavigate}
              onFolderCreated={onFolderCreated}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * One row — and now the ONLY drawer of tree rows, folders and the media view alike. The media row
 * borrows the folders' exact geometry (same 44 px box, same count column, same label x-position
 * via the chevron spacer) rather than drifting from it, which is why the right-hand affordance is
 * a SLOT and not a hardcoded `FolderMenu`: a view passes `menu={null}` and gets a row with nothing
 * to click but the link.
 */
function Row({
  href,
  label,
  count,
  depth,
  active,
  chevron,
  onToggle,
  menu,
}: {
  href: string
  label: string
  count: number
  depth: number
  active: boolean
  chevron: 'open' | 'closed' | 'none'
  onToggle?: () => void
  /** The row's right-hand affordance. Folder rows render `FolderMenu` (New subfolder / Rename /
   * Move to… / Delete); the Media row renders none — a view has no folder verbs, and offering them
   * against something that cannot exist would be the pane lying about the model. */
  menu?: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex min-h-11 items-center gap-1 rounded-chip pr-1',
        active ? 'bg-accent-soft' : 'hover:bg-paper-2',
      )}
      style={{ paddingLeft: `${depth * 12}px` }}
    >
      {/* The spacer matches the chevron's new box exactly, which is the whole point of it: a leaf
          and its expandable sibling have to put their labels on the same x. The media row's spacer
          keeps ITS label on that x too, which is what makes it read as a sibling and not as a
          footer. */}
      {chevron === 'none' ? (
        <span className="w-11 shrink-0" aria-hidden="true" />
      ) : (
        <button
          type="button"
          onClick={onToggle}
          disabled={onToggle == null}
          aria-label={chevron === 'open' ? `Collapse ${label}` : `Expand ${label}`}
          className={cn(TOUCH_ICON, 'shrink-0 text-ink-3 disabled:opacity-40')}
        >
          <span
            aria-hidden="true"
            className={cn(
              'inline-block border-y-[4px] border-l-[6px] border-y-transparent border-l-current transition-transform',
              chevron === 'open' && 'rotate-90',
            )}
          />
        </button>
      )}

      {/*
       * `py-3` and NOT `TOUCH_TARGET` + `flex items-center`. `truncate` is
       * `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`, and on a flex container the
       * text becomes an anonymous flex item that `text-overflow` never applies to — the label
       * would clip with no ellipsis. Padding keeps the link a block, keeps the ellipsis, and
       * 12 + ~20 + 12 is the 44 px the row is asking for.
       */}
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'min-w-0 flex-1 truncate py-3 text-[13px] font-medium',
          active ? 'text-ink' : 'text-ink-2',
        )}
        title={label}
      >
        {label}
      </Link>

      <span className="shrink-0 px-1 text-[11px] font-semibold text-ink-3 tabular-nums">
        {count}
      </span>

      {menu}
    </div>
  )
}
