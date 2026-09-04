import Link from 'next/link'

import type { AdminUserRow } from '@/lib/admin/users'
import { cn } from '@/lib/cn'

/**
 * Which user's memory. Server-rendered plain links, no `'use client'` and no `usePathname()` — the
 * same argument phase 15's `AdminNav` makes for not going client to bold one word, and the same
 * "a plain-text link, never an icon button" stance from `docs/design-brief.md`.
 *
 * It renders even when there is one account, because the page is per-user by contract (invariant
 * 7) and hiding the picker would make that invisible. One row is a fine list.
 */
export function UserPicker({
  users,
  selectedId,
}: {
  users: readonly AdminUserRow[]
  selectedId: string | null
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
            href={`/admin/memory?user=${encodeURIComponent(user.id)}`}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'rounded-field border px-3 py-2 text-[13px] font-semibold transition-colors',
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
