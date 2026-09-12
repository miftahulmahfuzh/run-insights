import Link from 'next/link'

import { TOUCH_TARGET } from '@/components/admin/touch'
import type { AdminUserRow } from '@/lib/admin/users'
import { cn } from '@/lib/cn'

/**
 * Which user's memory. Server-rendered plain links, no `'use client'` and no `usePathname()` — the
 * package readme still binds this picker to that by name, and where `AdminNav` grew a client leaf
 * for its active cell (`AdminNavLinks.tsx`, the owner's own order), this picker's callers already
 * know their route, so the client trade buys nothing here. The same "a plain-text link, never an
 * icon button" stance `AppShell`'s screen-title row established (`components/ui/AppShell.tsx`) —
 * `docs/design-brief.md` states no such stance.
 *
 * It renders even when there is one account, because the page is per-user by contract (invariant
 * 7) and hiding the picker would make that invisible. One row is a fine list.
 */
export function UserPicker({
  users,
  selectedId,
  basePath = '/admin/memory',
}: {
  users: readonly AdminUserRow[]
  selectedId: string | null
  /**
   * Which per-user admin route the pills navigate within. Defaults to `/admin/memory`, which is
   * where this component was born and its only caller until `/admin/shortcuts`.
   *
   * It is a PROP and not a `usePathname()` read, because
   * `components/admin/.workflows/package_readme.md` names this component in the rule: *"Do not add
   * active-link highlighting to `UserPicker`, and do not read the pathname anywhere in this
   * package but `AdminNavLinks.tsx`'s leaf"* — the `AdminNav` half of the old sentence was
   * overruled by the owner's own order for that nav's active cell (`admin-bottom-bar-active-tab`).
   * Going client to fix a href would be the same trade for less. Both callers are Server
   * Components and both already know their own route.
   *
   * The counts in each pill stay MEMORY counts — `AdminUserRow` is `lib/admin/users.ts`'s shape and
   * says how many slots and ledger rows an account has. On `/admin/shortcuts` that is still a true
   * statement about the account, just not about this page; adding a shortcut count would mean
   * widening `listAdminUsers` and `getAdminUser`, which are `/admin/memory`'s and are not this
   * phase's to change.
   */
  basePath?: string
}) {
  if (users.length === 0) {
    return (
      <p className="text-[13px] font-medium text-ink-3">
        No accounts yet. Sign in once and this page has something to show.
      </p>
    )
  }

  return (
    <nav aria-label="Which user" className="flex flex-wrap gap-2">
      {users.map((user) => {
        const selected = user.id === selectedId
        return (
          <Link
            key={user.id}
            href={`${basePath}?user=${encodeURIComponent(user.id)}`}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              TOUCH_TARGET,
              'flex items-center rounded-field border px-3 text-[13px] font-semibold transition-colors',
              selected
                ? 'border-accent bg-card text-ink'
                : 'border-rule text-ink-2 hover:bg-card hover:text-ink',
            )}
          >
            {user.name ?? user.email ?? user.id}
            <span className="ml-2 font-medium text-ink-3">
              {user.slots} slots &middot; {user.facts} facts
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
