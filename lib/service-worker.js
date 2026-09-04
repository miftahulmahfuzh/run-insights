/* global self */
/**
 * The app's first and only service worker. Two events: a push arrives, and a notification is
 * tapped. **Nothing else belongs in this file.**
 *
 * No `install`, no `activate`, no `fetch`, no cache, no precache, no Serwist. That is not
 * minimalism for its own sake: offline support and caching are out of scope for this plan set,
 * because **a caching worker changes how every page in the app loads** and a notification feature
 * does not get to make that decision in passing. A `fetch` handler added here would silently
 * become the app's page-load path.
 *
 * ── IT IS A BUNDLED MODULE, NOT `public/sw.js` ────────────────────────────────────────────────
 * `components/push/PushSetupCard.tsx` registers it as
 * `new URL('../../lib/service-worker.js', import.meta.url)`, which Next compiles into
 * `.next/static/service-worker/` and serves from `/_next/static/service-worker/…` at a URL that is
 * stable across deploys, with `Service-Worker-Allowed: /` supplied by the framework
 * (`next/dist/build/index.js:1657`). That header is what lets a script served from `/_next/…`
 * claim scope `/`. Moving this file to `public/` would lose the header and the registration would
 * fail with a scope error.
 *
 * ── A REGISTERED WORKER OUTLIVES THE DEPLOY THAT SHIPPED IT ───────────────────────────────────
 * The browser keeps the old worker until it can update, so a phone can be running LAST WEEK'S copy
 * of this file against THIS week's payloads. Hence the version field in `NinaPushPayload` and the
 * defensive reads below: an unknown field is ignored, a missing title falls back, and a payload
 * that will not parse still produces a notification rather than a silent drop. **If a payload
 * field's meaning changes rather than being added, bump `v` in `lib/push/payload.ts` and branch on
 * it here.**
 *
 * This file is plain `.js` deliberately: it runs in a `ServiceWorkerGlobalScope` where `self` is
 * not a `Window` and the DOM lib types are wrong rather than merely absent. `tsconfig.json`'s
 * `include` lists no `.js` pattern and nothing imports this module (it is referenced as a
 * `new URL(…)` asset), so **the payload contract with `lib/push/payload.ts` is unchecked by the
 * compiler** — which is exactly why every read below is defensive.
 *
 * ── `includeUncontrolled: true` IS LOAD-BEARING, TWICE ────────────────────────────────────────
 * A worker does not control a page that was already open when it was registered; it would need a
 * `clients.claim()` in an `activate` handler, and this file has no lifecycle handlers by design.
 * Without `includeUncontrolled`, `matchAll` returns an empty list on exactly the session where the
 * runner just turned notifications on — so the live-arrival postMessage would go nowhere, and the
 * tap handler would open a second `/nina` beside the one already on screen.
 */

/** Kept in step with `PUSH_TARGET_URL` in `lib/push/payload.ts`. */
const FALLBACK_URL = '/nina'
/** Kept in step with `PUSH_NOTIFICATION_TAG`. */
const FALLBACK_TAG = 'nina'
/** Read by `ChatScreen`; kept in step with `SW_MESSAGE_TYPE` in `lib/nina/live.ts`. */
const LIVE_MESSAGE_TYPE = 'nina:new'

/**
 * `event.data.json()` throws on a non-JSON payload, and a throw inside a `push` handler on iOS
 * means the notification is never shown — which the platform counts against the app's push
 * budget. So it is caught, and the catch still shows something.
 */
function readPayload(event) {
  if (!event.data) return null
  try {
    const data = event.data.json()
    if (data === null || typeof data !== 'object') return null
    return data
  } catch (error) {
    console.warn('[sw] unreadable push payload', error)
    return null
  }
}

function notifyOpenWindows() {
  return self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then(function (clientList) {
      for (const client of clientList) {
        client.postMessage({ type: LIVE_MESSAGE_TYPE })
      }
    })
    .catch(function (error) {
      /* Never let this reject the outer waitUntil — the notification matters, this is a bonus. */
      console.warn('[sw] postMessage failed', error)
    })
}

self.addEventListener('push', function (event) {
  const data = readPayload(event) || {}

  const title = typeof data.title === 'string' && data.title.length > 0 ? data.title : 'Nina'
  const body = typeof data.body === 'string' && data.body.length > 0 ? data.body : 'New message.'
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : FALLBACK_URL
  const tag = typeof data.tag === 'string' && data.tag.length > 0 ? data.tag : FALLBACK_TAG

  const options = {
    body: body,
    /*
     * `app/icon.png` is a Next file convention, so its URL is hashed and not knowable from here.
     * `/icons/icon-192.png` is a committed public asset from `lib/pwa.ts`'s `PWA_ICONS`, which is
     * why it is the one to name. Android draws `icon` in the notification and `badge` as the
     * monochrome status-bar glyph; iOS ignores both and uses the installed app's own icon.
     */
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    /*
     * One tag for every Nina notification, so a second turn REPLACES the first in the tray instead
     * of stacking four bubbles as four notifications. `renotify` is what keeps the replacement from
     * landing silently — without it, a replaced notification updates the tray with no buzz, which
     * is exactly the opposite of this phase's whole purpose.
     */
    tag: tag,
    renotify: true,
    /*
     * Short-short-long. Not the guide's [100, 50, 100]: this is the app's only notification, so it
     * gets to have a recognisable pattern rather than a generic one. Ignored on iOS.
     */
    vibrate: [90, 40, 90, 40, 180],
    /*
     * `data` is what `notificationclick` reads back. It is the ONLY channel between the two
     * handlers — a module-scope variable would not survive the worker being terminated between the
     * push and the tap, which is the normal case on a phone.
     */
    data: { url: url, messageId: data.messageId || null, kind: data.kind || null },
  }

  /*
   * Both jobs in one `waitUntil`. The notification is FIRST in the array on purpose: on iOS a
   * `push` handler that resolves without having shown a notification is a policy violation, so
   * nothing may be awaited ahead of `showNotification`.
   */
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      /*
       * Live arrival. Tell every open window that something new exists; `ChatScreen` turns this
       * into a `router.refresh()`. Deliberately a bare signal and not the message itself — the page
       * re-reads from the database, so there is one source of truth for what is on screen and no
       * way for a push payload to inject a bubble.
       */
      notifyOpenWindows(),
    ]),
  )
})

/**
 * A tap. **Focus an existing window rather than opening a second one**, which is the difference
 * between "the app" and "a browser that keeps spawning tabs". `openWindow` is the fallback for the
 * genuinely-closed case.
 */
self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || FALLBACK_URL

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (const client of clientList) {
          /*
           * Same-origin by construction (a worker only sees its own origin's clients), so a pathname
           * comparison is the whole check. An open window ANYWHERE in the app is focused and
           * navigated — being on `/trends` when Nina writes should take you to her, not open a
           * duplicate app beside the one you have.
           */
          const url = new URL(client.url)
          if (url.pathname === target) return client.focus()
          if ('navigate' in client) {
            return client.navigate(target).then(function (navigated) {
              return navigated ? navigated.focus() : client.focus()
            })
          }
        }
        return self.clients.openWindow(target)
      }),
  )
})
