'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { buildTree, folderAncestors, type FolderNode } from '@/lib/admin/filetree'
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
  hrefFor,
}: {
  folders: readonly ExplorerFolder[]
  /** `''` is the album root. */
  current: string
  /** Built by `FileExplorer` so the URL grammar has one home. */
  hrefFor: (folder: string) => string
}) {
  /*
   * `buildTree` returns ONE root node, not an array — phase 2's shape, reconciled from the draft's
   * `FolderNode[]`. That is the better shape here and it deletes code: the root's label, its
   * subtree total and whether it has anything to expand all come off the node instead of being
   * recomputed in this component (the draft summed `folders` by hand for the root's count, which
   * was a second opinion about a number `totaliseFolderNode` had already worked out).
   *
   * `ExplorerFolder` is `{ folder: string; count: number }`, which is structurally phase 2's
   * `FolderCount` — so it goes straight in with no mapping.
   */
  const root = useMemo(() => buildTree(folders), [folders])
  const onPath = useMemo(() => new Set([...folderAncestors(current), current]), [current])
  const [override, setOverride] = useState<Record<string, boolean>>({})

  return (
    <nav aria-label="Album folders" className="rounded-card border border-rule bg-card p-3">
      <p className="mb-2 px-2 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">
        Folders
      </p>

      <Row
        href={hrefFor('')}
        label={root.name}
        count={root.totalCount}
        depth={0}
        active={current === ''}
        chevron={root.children.length > 0 ? 'open' : 'none'}
        onToggle={undefined}
      />

      <ul className="mt-0.5">
        {root.children.map((node) => (
          <Branch
            key={node.path}
            node={node}
            depth={1}
            current={current}
            onPath={onPath}
            override={override}
            setOverride={setOverride}
            hrefFor={hrefFor}
          />
        ))}
      </ul>

      {/* SEAM — PHASE 6. The folder-maintenance affordances belong here and in `Row` below:
          a "New folder" button under this nav (it needs `current` as its parent), and a
          right-click or kebab on `Row` for rename / move / delete. `Row` is already the single
          place a folder is drawn, so phase 6 adds one control to one component. The move TARGET
          is `FileExplorer`'s `destination`, which is this rail's `current`. */}
    </nav>
  )
}

function Branch({
  node,
  depth,
  current,
  onPath,
  override,
  setOverride,
  hrefFor,
}: {
  node: FolderNode
  depth: number
  current: string
  onPath: ReadonlySet<string>
  override: Record<string, boolean>
  setOverride: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  hrefFor: (folder: string) => string
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
        active={current === node.path}
        chevron={hasChildren ? (open ? 'open' : 'closed') : 'none'}
        onToggle={
          hasChildren
            ? () => setOverride((previous) => ({ ...previous, [node.path]: !open }))
            : undefined
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
              onPath={onPath}
              override={override}
              setOverride={setOverride}
              hrefFor={hrefFor}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/** One folder, one row. The only place a folder is drawn — see the seam note above. */
function Row({
  href,
  label,
  count,
  depth,
  active,
  chevron,
  onToggle,
}: {
  href: string
  label: string
  count: number
  depth: number
  active: boolean
  chevron: 'open' | 'closed' | 'none'
  onToggle?: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-chip pr-2',
        active ? 'bg-accent-soft' : 'hover:bg-paper-2',
      )}
      style={{ paddingLeft: `${depth * 12}px` }}
    >
      {chevron === 'none' ? (
        <span className="w-5 shrink-0" aria-hidden="true" />
      ) : (
        <button
          type="button"
          onClick={onToggle}
          disabled={onToggle == null}
          aria-label={chevron === 'open' ? `Collapse ${label}` : `Expand ${label}`}
          className="flex size-5 shrink-0 items-center justify-center text-ink-3 disabled:opacity-40"
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

      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'min-w-0 flex-1 truncate py-1.5 text-[13px] font-medium',
          active ? 'text-ink' : 'text-ink-2',
        )}
        title={label}
      >
        {label}
      </Link>

      <span className="shrink-0 text-[11px] font-semibold text-ink-3 tabular-nums">{count}</span>
    </div>
  )
}
