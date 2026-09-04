'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui'
import { INSTALL } from '@/lib/pwa'
import {
  sendTestPushAction,
  subscribeToPushAction,
  unsubscribeFromPushAction,
} from '@/lib/push/actions'

/**
 * ── THE ONE PLACE THIS APP DELIBERATELY IGNORES NEXT'S PWA GUIDE ──────────────────────────────
 * `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` reads the VAPID public
 * key here as `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY`. **This repo forbids the `NEXT_PUBLIC_`
 * prefix outright** — ROADMAP §4.1, enforced by `scripts/check-client-secret-boundary.mjs` RULE 3,
 * which greps `app/`, `lib/` and `components/` for the literal and fails unconditionally.
 *
 * So the key arrives as a PROP, read server-side by `PushSetup.tsx` through `pushEnv()`. The value
 * reaches the browser either way — a VAPID public key travels inside every `subscribe()` call and
 * is public by construction. What the prop buys is that the guard stays absolute instead of growing
 * its first exception, and that nobody reading this codebase later concludes the rule is
 * negotiable.
 *
 * **Do not "fix" this back to the documented version.** `npm run ci:client-secret-guard` will
 * fail, and it will be right.
 *
 * ── THE iOS HINT IS REAL, NOT DECORATIVE ──────────────────────────────────────────────────────
 * iOS 16.4+ delivers Web Push only to a PWA installed to the home screen — not to Safari, not to a
 * tab, not to a bookmark. The design target is an iPhone XS Max, so on the runner's own device the
 * install path is a prerequisite for this feature rather than a nicety. In a tab `PushManager` is
 * genuinely absent, so a subscribe button there would throw on tap; the install instruction is
 * rendered *instead of* the button, not above it.
 */

/**
 * The VAPID public key is base64url; `PushManager.subscribe` wants bytes.
 *
 * This differs from the guide's version in one way that matters under this repo's TypeScript
 * (5.9, `strict`): the array is built over an explicitly allocated `ArrayBuffer` so the return type
 * is `Uint8Array<ArrayBuffer>` and satisfies `BufferSource`. The guide's `new Uint8Array(length)`
 * infers `Uint8Array<ArrayBufferLike>`, which TS 5.9's generic typed arrays will not accept there.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const buffer = new ArrayBuffer(rawData.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < rawData.length; i += 1) bytes[i] = rawData.charCodeAt(i)
  return bytes
}

/**
 * What this browser can actually do, decided once on mount.
 *
 *   `probing`       — the effect has not run yet. Renders as the subscribed/unsubscribed state the
 *                     server already knew, so there is no flash of "unsupported".
 *   `ready`         — `serviceWorker` and `PushManager` both exist. Subscribe works.
 *   `needs-install` — iOS, in a browser tab. Push is IMPOSSIBLE here; the install hint is the whole
 *                     of what this component can usefully say.
 *   `denied`        — the runner said no to the permission prompt. A button cannot re-ask; only
 *                     Settings can.
 *   `unsupported`   — everything else.
 */
type Support = 'probing' | 'ready' | 'needs-install' | 'denied' | 'unsupported'

export function PushSetupCard({
  vapidPublicKey,
  initiallySubscribed,
}: {
  /** Read server-side from `pushEnv().VAPID_PUBLIC_KEY`. See the header. */
  vapidPublicKey: string
  /** From `countLivePushSubscriptions` — what the DATABASE thinks, before the browser is asked. */
  initiallySubscribed: boolean
}) {
  const [support, setSupport] = useState<Support>('probing')
  const [subscribed, setSubscribed] = useState(initiallySubscribed)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  /* StrictMode double-invokes effects in development, and a runner can navigate away mid-await.
   * The same guard `ChatScreen` and `InsightTrigger` use, for the same reason. */
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  /**
   * Probe, and register the worker.
   *
   * **Registration lives here and only here.** `register()` is idempotent for the same URL and
   * scope — it returns the existing registration — but putting it in one place means there is one
   * answer to "when does this app install a service worker": when the runner opens `/me`. Not on
   * every page load, and not from `ChatScreen`, which only needs to LISTEN and can do that without
   * a registration of its own.
   */
  useEffect(() => {
    let cancelled = false

    async function probe() {
      const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        /* iOS's own pre-standard flag. Still the only reliable signal on older iOS, and reading it
         * needs a cast because it is not in the DOM lib. */
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        /* On iOS in a tab, `PushManager` is genuinely absent — that is the platform telling us the
         * app must be installed first, and it is a DIFFERENT message from "your browser cannot do
         * this at all". */
        if (!cancelled) setSupport(iOS && !standalone ? 'needs-install' : 'unsupported')
        return
      }

      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        if (!cancelled) setSupport('denied')
        return
      }

      try {
        const registration = await navigator.serviceWorker.register(
          /*
           * A BUNDLED module, not `/sw.js`. Next compiles this into `.next/static/service-worker/`
           * and serves it with `Service-Worker-Allowed: /`, which is what makes `scope: '/'` legal
           * from a `/_next/…` URL. `updateViaCache: 'none'` stops the browser's HTTP cache from
           * serving a stale worker script on the update check — belt to the `no-store` header in
           * `next.config.ts`.
           */
          new URL('../../lib/service-worker.js', import.meta.url),
          { scope: '/', updateViaCache: 'none' },
        )
        const existing = await registration.pushManager.getSubscription()
        if (cancelled) return
        setSupport('ready')
        /* The browser is the authority on whether THIS device is subscribed; the server row only
         * says some device is. A phone that cleared its site data shows "off" here even though the
         * row survives, which is correct — and the next send prunes the row. */
        setSubscribed(existing !== null)
      } catch (cause) {
        if (cancelled) return
        console.warn('[push] service worker registration failed', cause)
        setSupport('unsupported')
      }
    }

    void probe()
    return () => {
      cancelled = true
    }
  }, [])

  const subscribe = useCallback(async () => {
    setBusy(true)
    setNotice(null)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        /* Required by every browser: it promises that every push shows a notification. This
         * worker's `push` handler always calls `showNotification`, including on an unreadable
         * payload, which is what makes the promise true. */
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })

      /* `toJSON()` and not the subscription object: a `PushSubscription` is a host object with
       * methods, and a Server Action argument must be serialisable. The guide's
       * `JSON.parse(JSON.stringify(sub))` is the same thing spelled with two more calls. */
      const result = await subscribeToPushAction({
        subscription: subscription.toJSON(),
        userAgent: navigator.userAgent,
      })

      if (!alive.current) return
      if (!result.ok) {
        setNotice(result.message ?? 'That did not save. Try again.')
        return
      }
      setSubscribed(true)
    } catch (cause) {
      if (!alive.current) return
      /* A `NotAllowedError` here is the runner tapping "Don't Allow". It is not an error to
       * apologise for, and it is the only branch that changes `support`. */
      const denied = cause instanceof Error && cause.name === 'NotAllowedError'
      if (denied) setSupport('denied')
      else setNotice('Your browser would not turn them on. Try again, or reload the page.')
    } finally {
      if (alive.current) setBusy(false)
    }
  }, [vapidPublicKey])

  const unsubscribe = useCallback(async () => {
    setBusy(true)
    setNotice(null)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      /* Read the endpoint BEFORE unsubscribing — `unsubscribe()` does not invalidate the object,
       * but the row is keyed by endpoint and getting the order wrong here is how a database ends up
       * claiming a phone is subscribed when it is not. */
      const endpoint = subscription?.endpoint ?? null
      if (subscription) await subscription.unsubscribe()
      if (endpoint) await unsubscribeFromPushAction({ endpoint })
      if (!alive.current) return
      setSubscribed(false)
    } catch (cause) {
      if (!alive.current) return
      console.warn('[push] unsubscribe failed', cause)
      setNotice('Could not turn them off. Reload and try again.')
    } finally {
      if (alive.current) setBusy(false)
    }
  }, [])

  const sendTest = useCallback(async () => {
    setBusy(true)
    setNotice(null)
    const result = await sendTestPushAction()
    if (!alive.current) return
    setNotice(result.ok ? 'Sent. It should arrive in a second or two.' : result.message)
    setBusy(false)
  }, [])

  if (support === 'needs-install') {
    return (
      <p className="text-[13px] font-medium text-ink-2">
        On an iPhone, Nina can only reach you once {INSTALL.shortName} is on your home screen —
        Safari does not deliver notifications to a browser tab. Tap the share button, then
        <span className="font-semibold"> Add to Home Screen</span>, then open the app from the icon
        and come back here.
      </p>
    )
  }

  if (support === 'denied') {
    return (
      <p className="text-[13px] font-medium text-ink-2">
        Notifications are blocked for this app. Only your device settings can change that — iOS:
        Settings &gt; Notifications &gt; {INSTALL.shortName}.
      </p>
    )
  }

  if (support === 'unsupported') {
    return (
      <p className="text-[13px] font-medium text-ink-2">
        This browser cannot do push notifications. Nina still writes — the dot on her tab is how you
        will know.
      </p>
    )
  }

  return (
    <div>
      <p className="mb-4 text-[13px] font-medium text-ink-2">
        {subscribed
          ? 'On. Nina can reach you when the app is closed.'
          : 'Off. Nina writes anyway; you just will not know until you open the app.'}
      </p>

      <div className="flex gap-2">
        {subscribed ? (
          <>
            <Button variant="secondary" size="md" onClick={unsubscribe} disabled={busy}>
              Turn off
            </Button>
            <Button variant="secondary" size="md" onClick={sendTest} disabled={busy}>
              Send me a test
            </Button>
          </>
        ) : (
          <Button size="md" onClick={subscribe} disabled={busy || support === 'probing'}>
            Turn on notifications
          </Button>
        )}
      </div>

      {notice !== null && <p className="mt-3 text-[12px] font-medium text-ink-3">{notice}</p>}
    </div>
  )
}
