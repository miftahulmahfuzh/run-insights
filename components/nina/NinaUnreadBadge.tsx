import { Suspense } from 'react'

import { getUserId } from '@/lib/auth/requireUserId'
import { countUnreadNinaMessages } from '@/lib/nina/queries'

/**
 * The unread dot on the Nina tab — F33 R3's cheapest and most constant piece of proactivity. A
 * message she wrote in `after()` or in the evening cron is invisible until the runner opens the
 * app; this is what tells him there is something there.
 *
 * ── WHY A SERVER COMPONENT INSIDE A CLIENT TAB BAR ──────────────────────────────────────────────
 * `TabBar` is `'use client'` (it needs `usePathname` for `aria-current`) and a client component
 * cannot await a count. The three alternatives were all worse: a client fetch needs a route
 * handler, and D7 sanctions five of those for reasons that have not changed; a poll burns a
 * serverless invocation per tick to learn nothing on almost every tick; and threading a number down
 * from every page means editing seven call sites including two `loading.tsx` files that cannot
 * fetch at all. Passing a server-rendered node into a client component as a prop is the framework's
 * own answer, and it keeps the count out of the client bundle entirely.
 *
 * ── WHEN IT UPDATES ─────────────────────────────────────────────────────────────────────────────
 * On every server render of a tabbed screen, which in practice means every navigation. Open
 * `/nina`, the page marks everything read in `after()`, navigate anywhere, the dot is gone. It is
 * deliberately NOT live: making it live needs a signal, and the only honest one in this plan set is
 * phase 11's service worker `postMessage`-ing its clients. A dot that is at most one navigation
 * stale is a fair trade for zero polling.
 *
 * ── WHY `getUserId` AND NOT `requireUserId` ─────────────────────────────────────────────────────
 * This renders inside `AppShell`, which `/`'s signed-out state also renders, and which the two
 * `loading.tsx` files render with no session resolved at all. `requireUserId()` would
 * `redirect('/')` from inside a loading fallback, which is a soft-404 of the kind
 * `app/(app)/loading.tsx` already warns about. No session means no dot.
 */
export async function NinaUnreadBadge() {
  const userId = await getUserId()
  if (userId == null) return null

  const unread = await countUnreadNinaMessages(userId)
  if (unread === 0) return null

  return (
    <span
      /* `-right-1 -top-1` against the `size-5` icon box `Tab` puts around the glyph. Absolute, so
         it never participates in that grid and never nudges the label. */
      className="absolute -top-1 -right-1 size-2.5 rounded-full bg-z5 ring-2 ring-card"
      /* A count is not rendered: at one user and one Nina, "there is something" is the entire
         message, and a number on a 10px tab label is noise. The screen-reader text carries the
         count because there it costs nothing. */
      role="status"
      aria-label={`${unread} unread ${unread === 1 ? 'message' : 'messages'} from Nina`}
    />
  )
}

/**
 * The mountable wrapper: the badge is an async component and `AppShell` renders synchronously, so
 * the suspense boundary lives here rather than being repeated at the call site. `fallback={null}`
 * because a skeleton dot would be a lie — the honest states are "no dot yet" and "dot".
 */
export function NinaUnreadBadgeSlot() {
  return (
    <Suspense fallback={null}>
      <NinaUnreadBadge />
    </Suspense>
  )
}
