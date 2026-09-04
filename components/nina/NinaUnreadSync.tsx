'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { shouldRefreshUnreadDot } from '@/lib/nina/unread'

/**
 * R9. The dot the runner just read himself out of existence, actually going away.
 *
 * ── THE BUG THIS FIXES ────────────────────────────────────────────────────────────────────────
 * `app/nina/page.tsx` marks the open session read in `after()` — after the response has been sent —
 * and `NinaUnreadBadge` is a Server Component inside that same response. So the payload the runner
 * is looking at was rendered against a table where his messages were still unread, and nothing
 * re-rendered it. `NinaUnreadBadge`'s docstring used to call that "at most one navigation stale…
 * a fair trade for zero polling"; the user reported the trade as a defect, and he is right: he read
 * everything and the dot was still painted.
 *
 * ── WHY A CLIENT PULL AND NOT A SERVER PUSH ───────────────────────────────────────────────────
 * There is no push available at this point in the request. `revalidatePath` "can be called in
 * Server Functions and Route Handlers" (Next 16.3.1,
 * `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`) — a page
 * render is neither, `/nina` is dynamic so there is no route cache entry to expire anyway, and by
 * the time `after()` runs the response is finished and the dot is already on the wire. So the
 * screen asks, once.
 *
 * `router.refresh()` is the documented tool for exactly this: it re-renders the Server Components
 * of the current route and "the client will merge the updated React Server Component payload
 * without losing unaffected client-side React (e.g. `useState`) or browser state (e.g. scroll
 * position)" (`use-router.md`). `AppShell` — and therefore the badge slot it passes into the tab
 * bar — is rendered by `app/nina/page.tsx`, so the badge is inside this route's payload and comes
 * back with a count taken after the UPDATE. `ChatScreen` survives untouched, and
 * `mergeServerMessages` returns the same array reference when the refreshed list brings nothing
 * new, so the conversation does not even re-render.
 *
 * ── WHY THIS IS NOT THE POLL THAT WAS REJECTED ────────────────────────────────────────────────
 * A poll "burns a serverless invocation per tick to learn nothing on almost every tick". This has
 * no timer. It fires when `hadUnread` becomes true — which is once per opening of a chat that
 * actually had something unread in it, and never on a visit with nothing to clear.
 * `lib/nina/unread.ts` owns the decision and its termination argument, and is unit-tested; this
 * file owns only the effect and the ref.
 *
 * The ref holds the flag value already reacted to, which is what makes React's development-only
 * double-invoked effect harmless (the second setup sees its own value and returns) while still
 * allowing a genuine `false -> true` flip — a service-worker refresh delivering a new message — to
 * get its own single refresh.
 */
export function NinaUnreadSync({ hadUnread }: { hadUnread: boolean }) {
  const router = useRouter()
  /* `null` and not `false`: "not yet reacted to anything" is a third state, and conflating it with
     "last saw false" would make the very first render's `true` look like a flip we had handled. */
  const syncedForRef = useRef<boolean | null>(null)

  useEffect(() => {
    const refresh = shouldRefreshUnreadDot({ hadUnread, syncedFor: syncedForRef.current })
    /* Recorded BEFORE the early return, and for both values: a `false` render is what a later
       arrival flips away from, so it has to be remembered too. */
    syncedForRef.current = hadUnread
    if (!refresh) return
    router.refresh()
  }, [hadUnread, router])

  return null
}
