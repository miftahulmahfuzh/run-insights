'use client'

import { EmptyState } from '@/components/ui/EmptyState'
import type { SidebarList } from '@/lib/nina/sidebar'
import { SessionRow } from './SessionRow'

/**
 * Every chat, in phase 1's order — F35 R2's history list, R4's pinned-first.
 *
 * This component decides NOTHING. `planSessionList` chose between rows and the empty state and
 * marked the open one; the order came out of `listNinaSessions`. Both facts are asserted in
 * `lib/nina/sidebar.test.ts`, which is the only place they can be (invariant 7: `vitest.config.ts`
 * is `environment: 'node'`).
 *
 * ── THE EMPTY STATE, AND WHEN IT IS EVEN REACHABLE ────────────────────────────────────────────
 * Almost never: phase 1's migration backfills every existing message into one session per user, so
 * a runner with a conversation has at least one row. It is reachable in exactly two states — a
 * brand-new runner, and one who has just removed his last chat (R11) — and both are real, so it is
 * built rather than assumed away.
 *
 * `EmptyState` and not a bespoke block: it is "the one shape absence takes in this app", dashed
 * rather than a card so it reads as "this will fill up" rather than as an error, and it ships zero
 * client JS. Its `action` slot is deliberately left empty here — the create-a-chat control is R2's
 * and belongs in the panel's `newChatSlot` above this list, where it is also reachable when the
 * list is NOT empty. One control, one place.
 */
export function SessionList({
  list,
  activeSessionId,
  onClose,
}: {
  list: SidebarList
  /* Passed straight through to `SessionRow`, which hands it to phase 3's `removeNinaChatSession`
   * so the SERVER decides where a removal lands. `row.active` is the same fact reduced to a
   * boolean and is used only for the row's own styling. */
  activeSessionId: string | null
  onClose: () => void
}) {
  if (list.kind === 'empty') {
    return (
      <EmptyState
        title="Belum ada chat"
        description="Chat baru akan muncul di sini, yang terbaru di atas."
      />
    )
  }

  return (
    <ul className="space-y-1.5">
      {list.rows.map((row) => (
        <li key={row.session.id}>
          <SessionRow
            session={row.session}
            active={row.active}
            activeSessionId={activeSessionId}
            onClose={onClose}
          />
        </li>
      ))}
    </ul>
  )
}
