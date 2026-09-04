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
 * On every server render of a tabbed screen, which in practice means every navigation — **plus one
 * render on the chat screen itself, which is R9.** This docstring used to say the dot was
 * "deliberately NOT live" and that being "at most one navigation stale is a fair trade for zero
 * polling". The trade was real and the user filed it as a bug: he opens `/nina`, reads everything,
 * and the dot is still painted, because `app/nina/page.tsx` marks the session read in `after()` —
 * after this payload was rendered — and nothing re-rendered the bar carrying it.
 *
 * The trade is now paid off without a poll. `components/nina/NinaUnreadSync.tsx` fires exactly one
 * `router.refresh()` when, and only when, the render it arrived in delivered unread messages of
 * hers; the refreshed render counts after the UPDATE, so the dot goes. There is still no timer, no
 * interval and no route handler, and a visit with nothing to clear still costs nothing at all.
 * `lib/nina/unread.ts` holds the rule and the argument for why the sequence terminates.
 *
 * ── WHY THE COUNT IS STILL GLOBAL UNDER SESSIONS ────────────────────────────────────────────────
 * `countUnreadNinaMessages` is called here with no session: `role = 'nina' AND read_at IS NULL`
 * across every session is the dot's meaning — "there is something of hers you have not read" — and
 * it is also what keeps this query on the partial index `nina_messages_user_unread_idx`, which the
 * schema notes exists for this one query and which runs on every render of every tabbed screen.
 * MARK-read is the half that is session-scoped: opening one conversation says nothing about
 * another, so a message left unread in an older session correctly keeps the dot until he opens that
 * session. Assumption A3 (proactive messages land in the most recent session) is what makes the
 * common case clear itself on the first visit.
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
