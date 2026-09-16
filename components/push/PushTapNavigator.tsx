'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { SW_NAVIGATE_MESSAGE_TYPE } from '@/lib/nina/live'

/**
 * R1. The tapped notification actually going somewhere, from wherever the runner is standing.
 *
 * ── THE BUG THIS FIXES ────────────────────────────────────────────────────────────────────────
 * `lib/service-worker.js`'s `notificationclick` used to call `WindowClient.navigate()`, which
 * rejects with a `TypeError` when the worker does not CONTROL the window — and this worker never
 * calls `clients.claim()`, by design. On a PWA left open for days, every window is uncontrolled, so
 * the tap silently did nothing from every screen: the full-screen photo on `/nina/about`, another
 * session's chat, `/trends`, `/me`, anywhere. The worker now `postMessage`s the destination
 * instead, and this is the half that receives it.
 *
 * ── WHY THE ROOT LAYOUT AND NOT `AppShell` ───────────────────────────────────────────────────
 * `ChatScreen` already listens for `nina:new`, but only while `/nina` is mounted, and `AppShell`
 * misses `/photo/[kind]/[id]`, `/upload`, `/onboarding`, `/admin/*` and `/x/[extractionId]`
 * outright. "Wherever the user is" is the requirement, so this mounts in `app/layout.tsx` — the one
 * component that wraps literally every route — exactly once.
 *
 * ── WHY `router.push` AND NOT `window.location` ──────────────────────────────────────────────
 * The user's own repro is `/nina/about` with the `?photo=` full-screen viewer open. That overlay is
 * a query param on that page's own URL, not a route, and an ordinary client-side navigation to a
 * different pathname unmounts it along with the rest of the page — no reload, no flash of a cold
 * app, and `?jump=`'s scroll-and-flash landing (`components/nina/useQuoteLanding.ts`) runs on
 * arrival the same way it does for a search hit.
 *
 * ── THE LISTENER IS ON THE CONTAINER ─────────────────────────────────────────────────────────
 * `navigator.serviceWorker.addEventListener('message', …)` fires whether or not this page is
 * controlled by the worker and whether or not a registration exists yet — the property the whole
 * fix rests on, and the same one `ChatScreen`'s `nina:new` listener has relied on since F33
 * phase 11. No `alive` ref is needed here the way `PushSetupCard` and `useQuoteLanding` need one:
 * nothing in this effect is `await`ed, so there is no continuation that could outlive the unmount —
 * `removeEventListener` in the cleanup is the whole of it.
 */
export function PushTapNavigator() {
  const router = useRouter()

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; url?: unknown } | null
      if (data === null || typeof data !== 'object') return
      if (data.type !== SW_NAVIGATE_MESSAGE_TYPE) return
      /*
       * Same-origin PATH only, mirroring the `push` handler's own guard on the wire payload
       * (`lib/service-worker.js`: `data.url.startsWith('/')`). The second clause refuses a
       * protocol-relative `//host/path`, which starts with `/` and is NOT same-origin. A message
       * from the worker is trusted, but the string inside it came off the network, and a
       * registered worker outlives the deploy that shipped it — so the check is restated here
       * rather than assumed to have happened upstream.
       */
      if (typeof data.url !== 'string') return
      if (!data.url.startsWith('/') || data.url.startsWith('//')) return
      router.push(data.url)
    }

    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [router])

  return null
}
