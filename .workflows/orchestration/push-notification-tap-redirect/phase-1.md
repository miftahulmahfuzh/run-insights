# Phase 1: Make the tap work from anywhere

**Plan set:** `PUSH_NOTIFICATION_TAP_REDIRECT_PLAN.md`
**Analysis:** `20260916-084124-N9QZ_code_analyzer.md`
**Satisfies:** R1 — tapping a push notification brings the app forward and navigates, from any
screen or overlay the runner happens to be on, not just from a bare `/nina`.
**Depends on:** none
**Difficulty:** NORMAL
**Package:** root (`lib/service-worker.js`, `lib/nina/`, `components/push/`, `app/`)

---

## Goal

After this phase, `notificationclick` no longer depends on `WindowClient.navigate()` — a call that
rejects with a `TypeError` whenever the found window is not *controlled* by this worker, which is
the ordinary case for a PWA left open for days under a worker that deliberately never calls
`clients.claim()`. Instead it focuses a window (control-independent) and `postMessage`s the tap's
destination to it; a new root-layout client component, `PushTapNavigator`, turns that message into
an ordinary `router.push()`. Every route in the app — including the five that render no `AppShell`
— carries the listener, and no branch of the click handler can produce an unhandled rejection.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:**
- No exported symbol is deleted.
- Deleted *code*: the `if ('navigate' in client) { return client.navigate(target)… }` branch and
  the `if (url.pathname === target) return client.focus()` pathname-only branch inside
  `lib/service-worker.js`'s `notificationclick` handler (`lib/service-worker.js:151-166`). Both are
  replaced, not relocated. `WindowClient.navigate()` is not called anywhere in the file afterwards.

**Renames:** none.

**Creates:**
- `SW_NAVIGATE_MESSAGE_TYPE` — exported const, value `'nina:navigate'` (`lib/nina/live.ts`, new
  line directly under `SW_MESSAGE_TYPE`).
- `PushTapNavigator` — exported React client component (`components/push/PushTapNavigator.tsx`,
  new file).
- `components/push/PushTapNavigator.test.tsx` — new test file.
- Module-private in `lib/service-worker.js`: `NAVIGATE_MESSAGE_TYPE` (const literal
  `'nina:navigate'`, restated — the SW cannot import), `routeKey(url, base)`,
  `pickTapTarget(clientList, target)`.

**Signature changes:** none. No exported function's signature changes anywhere in this phase.

**Requires (from earlier phases):** none — this phase has no `depends_on`.

**Leaves alone (owned by others / out of scope):**
- `lib/push/payload.ts`, `lib/push/send.ts`, `lib/push/duplicateImage.ts` — Phase 2.
- `lib/nina/turnrun.ts`, `lib/nina/imagerun.ts`, `lib/nina/imagejobs.ts`, `lib/nina/proactive.ts`,
  `lib/admin/chatPhotoActions.ts`, `scripts/nina-image-worker/*` — Phase 2.
- `lib/service-worker.js`'s `push` handler, `readPayload`, `notifyOpenWindows`, `FALLBACK_URL`,
  `FALLBACK_TAG`, `LIVE_MESSAGE_TYPE` — read but not modified.
- `components/ui/AppShell.tsx` — deliberately untouched; the listener mounts in `app/layout.tsx`
  because `AppShell` does not wrap `/photo/[kind]/[id]`, `/upload`, `/onboarding`, `/admin/*`,
  `/x/[extractionId]`.
- `components/nina/ChatScreen.tsx` — its existing `nina:new` listener is the precedent, not a
  target. It is not edited.
- `components/nina/useQuoteLanding.ts`, `lib/nina/jobview.ts` — the landing this phase routes
  toward; unchanged.

**Guarantee handed to Phase 2 (read this, reconciler):** Phase 2 needs **no** change to
`lib/service-worker.js`. The `push` handler's URL guard is `data.url.startsWith('/')`
(`lib/service-worker.js:86`), which already accepts `/nina?s=<id>&jump=<id>`; and this phase's
"already showing the target" comparison is written over `pathname + search`, so a query-carrying
target is compared correctly the day Phase 2 ships.

---

## Files

| File | Action | What changes |
|---|---|---|
| `lib/service-worker.js` | modify | add `NAVIGATE_MESSAGE_TYPE` const + `routeKey`/`pickTapTarget` helpers; rewrite the `notificationclick` handler (`:144-170`) to focus + `postMessage`, with no reachable unhandled rejection |
| `lib/nina/live.ts` | modify | add exported `SW_NAVIGATE_MESSAGE_TYPE` beside `SW_MESSAGE_TYPE` (`:28`), same "kept in step with" comment idiom |
| `lib/nina/live.test.ts` | modify | extend the import line (`:3`) and add a `describe('SW_NAVIGATE_MESSAGE_TYPE')` block pinning the literal, mirroring the existing `SW_MESSAGE_TYPE` block (`:17-23`) |
| `components/push/PushTapNavigator.tsx` | create | `'use client'` component: listens on `navigator.serviceWorker` for the nav message, `router.push`es its url, renders `null` |
| `components/push/PushTapNavigator.test.tsx` | create | happy-dom test: nav message → `router.push`; `nina:new` and junk → nothing; non-path url refused; renders nothing; listener removed on unmount |
| `app/layout.tsx` | modify | import `PushTapNavigator` and render it inside `<body>` as a sibling of `{children}` (`:85-91`) |

---

## Implementation Steps

### Step 1: Add the navigation message type to `lib/nina/live.ts`

**File:** `lib/nina/live.ts:27-28`

**Change:** Add a second exported message-type constant directly under `SW_MESSAGE_TYPE`, following
that constant's "Kept in step with … in `lib/service-worker.js`" comment idiom. The service worker
cannot import this module (plain unbundled `.js`, zero imports), so the literal is restated there —
exactly as `FALLBACK_URL`/`FALLBACK_TAG`/`LIVE_MESSAGE_TYPE` already are.

**Code:** replace lines 27-28

```ts
/** Kept in step with `LIVE_MESSAGE_TYPE` in `lib/service-worker.js`. */
export const SW_MESSAGE_TYPE = 'nina:new'
```

with

```ts
/** Kept in step with `LIVE_MESSAGE_TYPE` in `lib/service-worker.js`. */
export const SW_MESSAGE_TYPE = 'nina:new'

/**
 * The other thing the worker says: a notification was TAPPED, and this is where the tap wants to
 * land. Kept in step with `NAVIGATE_MESSAGE_TYPE` in `lib/service-worker.js`, and read by
 * `components/push/PushTapNavigator.tsx`.
 *
 * ── WHY A MESSAGE AND NOT `WindowClient.navigate()` ────────────────────────────────────────────
 * `notificationclick` used to call `client.navigate(target)` on whatever window `matchAll` handed
 * it. Per the Service Worker spec that call rejects with a `TypeError` when the worker does not
 * CONTROL the client — and `includeUncontrolled: true` only affects what `matchAll` can SEE, not
 * what `navigate()` is willing to do to it. This worker has no `activate` handler and therefore
 * never calls `clients.claim()` (a stated invariant in its own header), so any window opened
 * before the current worker took over is uncontrolled — on a PWA left open for days, that is the
 * normal case, not the edge one. The rejection had no `.catch()`, so it escaped `event.waitUntil`
 * unhandled and the tap silently did nothing.
 *
 * `postMessage` carries no such requirement: `navigator.serviceWorker.addEventListener('message',
 * …)` listens on the CONTAINER and fires whether or not the page is controlled — the same property
 * `SW_MESSAGE_TYPE` above has relied on since F33 phase 11. The listener then performs an ordinary
 * client-side `router.push`, which also unmounts query-param overlays (`/nina/about`'s `?photo=`
 * full-screen viewer, the user's own repro) instead of hard-reloading out of them.
 */
export const SW_NAVIGATE_MESSAGE_TYPE = 'nina:navigate'
```

**Impact:** one new export from a module with no `server-only` and no runtime dependencies, so it
is importable from a client component. `knip` sees it used by the new component. Nothing else in
the file changes.

---

### Step 2: Pin the new literal in `lib/nina/live.test.ts`

**File:** `lib/nina/live.test.ts:3` and `:17-23`

**Change:** extend the import and add a sibling `describe` block. Nothing but an assertion connects
the two halves of a string the compiler cannot check — the same argument the existing
`SW_MESSAGE_TYPE` block makes.

**Code:** replace line 3

```ts
import { appendNewBubbles, SW_MESSAGE_TYPE, mergeServerMessages } from './live'
```

with

```ts
import {
  appendNewBubbles,
  SW_MESSAGE_TYPE,
  SW_NAVIGATE_MESSAGE_TYPE,
  mergeServerMessages,
} from './live'
```

and insert, immediately after the existing `describe('SW_MESSAGE_TYPE', …)` block (after line 23):

```ts
describe('SW_NAVIGATE_MESSAGE_TYPE', () => {
  it('matches the literal `lib/service-worker.js` posts on a tap', () => {
    /* Same reason as above, and one more: this string is the ONLY thing standing between a tapped
     * notification and nothing happening. The worker restates it because it cannot import. */
    expect(SW_NAVIGATE_MESSAGE_TYPE).toBe('nina:navigate')
  })

  it('is not the live-arrival type — a refresh and a navigation are different events', () => {
    /* One listener per type, and `PushTapNavigator` must not route on `nina:new`: every push posts
     * that one to every open window, so conflating the two would navigate the whole app on arrival
     * rather than on a tap. */
    expect(SW_NAVIGATE_MESSAGE_TYPE).not.toBe(SW_MESSAGE_TYPE)
  })
})
```

**Impact:** `lib/nina/live.test.ts` grows two cases. No existing case changes.

---

### Step 3: Rewrite `notificationclick` in `lib/service-worker.js`

**File:** `lib/service-worker.js:47-48` (const block) and `:139-170` (the handler)

**Change (3a):** add the restated message-type literal beside `LIVE_MESSAGE_TYPE`. Replace lines
47-48:

```js
/** Read by `ChatScreen`; kept in step with `SW_MESSAGE_TYPE` in `lib/nina/live.ts`. */
const LIVE_MESSAGE_TYPE = 'nina:new'
```

with

```js
/** Read by `ChatScreen`; kept in step with `SW_MESSAGE_TYPE` in `lib/nina/live.ts`. */
const LIVE_MESSAGE_TYPE = 'nina:new'
/**
 * Read by `components/push/PushTapNavigator.tsx`; kept in step with `SW_NAVIGATE_MESSAGE_TYPE` in
 * `lib/nina/live.ts`, where the full argument for why a tap travels as a message lives.
 */
const NAVIGATE_MESSAGE_TYPE = 'nina:navigate'
```

**Change (3b):** replace the entire `notificationclick` block — lines 139 through 170, i.e. the
docstring and the handler — with the following. The old `url.pathname === target` /
`client.navigate(target)` loop disappears entirely.

**Code:**

```js
/**
 * `pathname + search` for a URL, resolved against a base — the identity of a ROUTE.
 *
 * `pathname` alone was the old comparison and it is about to be wrong twice over: the tap target
 * carries a query string (`/nina?s=…&jump=…`) and an open window carries its own, so a bare
 * pathname match says "already there" for two genuinely different screens. Returns `null` rather
 * than throwing on a URL that will not parse — an old notification from a previous deploy can
 * carry anything, and a throw here would take the whole tap down with it.
 */
function routeKey(url, base) {
  try {
    const parsed = new URL(url, base)
    return parsed.pathname + parsed.search
  } catch (error) {
    console.warn('[sw] unparseable url', url, error)
    return null
  }
}

/**
 * Which open window the tap belongs to, and whether it is already showing the target.
 *
 * Order matters: a window ALREADY on the target wins (focus it, send nothing — no reload, no
 * re-run of `?jump=`'s one-shot scroll); otherwise the window the runner was actually looking at
 * (`focused`, then `visible`) wins over some stale tab left open in another app; otherwise the
 * first one there is. `clientList` is never empty here — the caller checks.
 */
function pickTapTarget(clientList, target) {
  let focused = null
  let visible = null
  for (const client of clientList) {
    const targetKey = routeKey(target, client.url)
    if (targetKey !== null && targetKey === routeKey(client.url, client.url)) {
      return { client: client, alreadyThere: true }
    }
    if (focused === null && client.focused === true) focused = client
    if (visible === null && client.visibilityState === 'visible') visible = client
  }
  return { client: focused || visible || clientList[0], alreadyThere: false }
}

/**
 * A tap. **Focus an existing window rather than opening a second one**, which is the difference
 * between "the app" and "a browser that keeps spawning tabs". `openWindow` is the fallback for the
 * genuinely-closed case.
 *
 * ── WHY THIS DOES NOT CALL `WindowClient.navigate()` ──────────────────────────────────────────
 * It used to, and that was the whole bug: `navigate()` rejects with a `TypeError` unless this
 * worker CONTROLS the client, and this file has no `activate` handler and therefore no
 * `clients.claim()` (see the header — that is a deliberate invariant, not an oversight). Every
 * window opened before the current worker took over is uncontrolled, which on a PWA left open for
 * days is the ordinary case. The rejection had no `.catch()`, escaped `event.waitUntil` unhandled,
 * and the tap did nothing at all — from every screen except the one where the pathname happened to
 * already match.
 *
 * `focus()` has no control requirement, and neither does `postMessage`. So: focus the window, and
 * tell it where to go. `components/push/PushTapNavigator.tsx` — mounted in the ROOT LAYOUT, so it
 * exists on every route including the ones `AppShell` does not wrap — turns that message into a
 * `router.push`, which is also what correctly unmounts `/nina/about`'s `?photo=` overlay instead of
 * hard-reloading out of it.
 *
 * ── NOTHING BELOW CAN REJECT ─────────────────────────────────────────────────────────────────
 * `postMessage` is in a `try`, `focus()`'s promise has a `.catch()`, `routeKey` swallows its own
 * parse errors, and the whole chain ends in a `.catch()`. That exhaustiveness IS the fix: an
 * unhandled rejection in here is invisible (it logs to the worker's own console) and silently
 * costs the runner the tap.
 */
self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || FALLBACK_URL

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        /* Genuinely closed. The only branch that may open a window — anything else would put a
         * second copy of the app beside the one already on screen. */
        if (clientList.length === 0) return self.clients.openWindow(target)

        const picked = pickTapTarget(clientList, target)

        if (!picked.alreadyThere) {
          /* BEFORE `focus()`, and not after: focus can reject on a platform that wants a user
           * gesture it does not think it got, and the navigation must survive that. A window that
           * navigates without coming forward is a worse outcome than one that does both — it is a
           * far better one than today's, which does neither. */
          try {
            picked.client.postMessage({ type: NAVIGATE_MESSAGE_TYPE, url: target })
          } catch (error) {
            console.warn('[sw] tap postMessage failed', error)
          }
        }

        /* `Promise.resolve().then(…)` so a SYNCHRONOUS throw from `focus()` lands in the same
         * `.catch()` as a rejection. */
        return Promise.resolve()
          .then(function () {
            return picked.client.focus()
          })
          .catch(function (error) {
            console.warn('[sw] focus failed', error)
          })
      })
      .catch(function (error) {
        /* `matchAll` itself, or anything the chain above missed. The notification is already
         * closed by this point; there is nothing left to do but say so. */
        console.warn('[sw] notificationclick failed', error)
      }),
  )
})
```

**Impact:**
- The tap now works from every screen, controlled or not, because neither `focus()` nor
  `postMessage` requires control.
- Behaviour change worth naming: a window at `/nina?s=other` receiving a target of `/nina` used to
  be treated as "already there" (pathname-only match) and merely focused. It is now focused **and**
  told to navigate to `/nina`. That is the correct reading of the target, and it is the comparison
  R2's query-carrying URLs need.
- One accepted transient: an open tab still running the page bundle from a deploy *before* this
  phase has no `PushTapNavigator`, so it will focus without navigating until it reloads. It is
  strictly better than today (today it does not even focus, because the whole handler dies on the
  rejection), and it self-heals on the next load. No mitigation is worth a second navigation
  mechanism whose only job is a one-deploy window.
- `lib/service-worker.js` still has exactly two event listeners (`push`, `notificationclick`) and
  no `install`/`activate`/`fetch` — plan invariant 2 holds.

---

### Step 4: Create `components/push/PushTapNavigator.tsx`

**File:** `components/push/PushTapNavigator.tsx` (new file, beside `PushSetupCard.tsx` /
`PushSetup.tsx`)

**Change:** a `'use client'` component that listens on the service-worker container and routes.
It registers nothing — registration is `PushSetupCard`'s single job, on `/me` — and renders
nothing, the `NinaUnreadSync` idiom.

**Code:**

```tsx
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
```

**Impact:** one new client component. It imports only `next/navigation`, `react`, and
`@/lib/nina/live` (a pure module with no `server-only`), so it adds nothing to the client bundle
beyond itself. Because it mounts in the root layout it is present on `/login` and `/admin` too;
that is harmless — with no push subscription no message ever arrives, and the listener costs one
`addEventListener`.

---

### Step 5: Mount it in `app/layout.tsx`

**File:** `app/layout.tsx:1-4` (imports) and `:85-91` (the component)

**Change (5a):** add the import. The file's existing order is `next` types, `next/font/google`,
`@/…`, then the stylesheet — so the new `@/components/…` line goes above `@/lib/pwa`.

Replace lines 1-4:

```tsx
import type { Metadata, Viewport } from 'next'
import { Poppins } from 'next/font/google'
import { APPLE_WEB_APP, INSTALL } from '@/lib/pwa'
import './globals.css'
```

with

```tsx
import type { Metadata, Viewport } from 'next'
import { Poppins } from 'next/font/google'
import { PushTapNavigator } from '@/components/push/PushTapNavigator'
import { APPLE_WEB_APP, INSTALL } from '@/lib/pwa'
import './globals.css'
```

**Change (5b):** render it inside `<body>`. Replace lines 85-91:

```tsx
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
```

with

```tsx
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-dvh antialiased">
        {children}
        {/*
         * R1. Renders nothing; it exists to hear `lib/service-worker.js` say a notification was
         * tapped and to `router.push` where the tap wanted to go. It lives HERE and not in
         * `AppShell` because `AppShell` does not wrap `/photo/[kind]/[id]`, `/upload`,
         * `/onboarding`, `/admin/*` or `/x/[extractionId]`, and the requirement is "wherever the
         * user is". One mount, every route.
         */}
        <PushTapNavigator />
      </body>
    </html>
  )
}
```

**Impact:** the root layout stays a Server Component — importing a `'use client'` child is the
normal boundary crossing and adds no `'use client'` to this file. `tests/pwa.install.test.ts`'s
"the root layout" block asserts over this file's SOURCE TEXT (`from '@/lib/pwa'`, `APPLE_WEB_APP`,
`manifest:`, `viewportFit: 'cover'`, `INSTALL.paper`/`paperDark`, and `not.toMatch(/ADMIN_INSTALL/)`);
every one of those still holds — verified against `tests/pwa.install.test.ts:150-180`.

---

### Step 6: Create `components/push/PushTapNavigator.test.tsx`

**File:** `components/push/PushTapNavigator.test.tsx` (new file)

**Change:** the structural match is `components/nina/NinaUnreadSync.test.tsx` (a null-rendering
effect component with a mocked `next/navigation`), plus `PushSetupCard.test.tsx`'s
`Object.defineProperty(window.navigator, 'serviceWorker', …)` / `delete` idiom for the container
stub. `components/nina/ChatScreen.test.tsx` has **no** service-worker coverage today (verified by
grep), so it is not the model.

`vitest.config.ts` includes `components/**/*.test.tsx`; the `@vitest-environment happy-dom` pragma
on line 1 is required (the project default environment is `node`).

**Code:**

```tsx
// @vitest-environment happy-dom
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: vi.fn(), replace: vi.fn() }),
}))

// The real constants: the point of this component is that it routes on ONE of the two strings the
// worker posts and ignores the other, so importing them keeps the test honest if either moves.
import { SW_MESSAGE_TYPE, SW_NAVIGATE_MESSAGE_TYPE } from '@/lib/nina/live'
import { PushTapNavigator } from './PushTapNavigator'

/**
 * The component is one listener and one call. What is pinned here is the decision tree around it:
 * WHICH message routes, which does not, which url is refused, and that the listener goes away with
 * the component. `navigator.serviceWorker` is a hand-rolled container stub because happy-dom has
 * none — the same `defineProperty` / `delete` idiom `PushSetupCard.test.tsx` uses.
 */
function installContainer() {
  const listeners = new Set<(event: MessageEvent) => void>()
  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: {
      addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
        if (type === 'message') listeners.add(listener)
      },
      removeEventListener: (type: string, listener: (event: MessageEvent) => void) => {
        if (type === 'message') listeners.delete(listener)
      },
    },
    configurable: true,
  })
  return {
    count: () => listeners.size,
    post: (data: unknown) => {
      /* A copy, so a listener that removes itself mid-dispatch cannot corrupt the walk. */
      for (const listener of [...listeners]) listener({ data } as MessageEvent)
    },
  }
}

beforeEach(() => {
  routerPush.mockReset()
})

afterEach(() => {
  delete (window.navigator as { serviceWorker?: unknown }).serviceWorker
})

describe('PushTapNavigator', () => {
  it('publishes nothing — it is a listener wearing a component', () => {
    installContainer()
    const { container } = render(<PushTapNavigator />)
    expect(container.firstElementChild).toBeNull()
  })

  it('routes to the url the worker sent with the tap', () => {
    const sw = installContainer()
    render(<PushTapNavigator />)

    sw.post({ type: SW_NAVIGATE_MESSAGE_TYPE, url: '/nina?s=sess-1&jump=msg-2' })

    expect(routerPush).toHaveBeenCalledTimes(1)
    expect(routerPush).toHaveBeenCalledWith('/nina?s=sess-1&jump=msg-2')
  })

  it('ignores the live-arrival message — every push posts that one to every window', () => {
    const sw = installContainer()
    render(<PushTapNavigator />)

    /* If this routed, the app would navigate on ARRIVAL rather than on a tap: `nina:new` goes to
     * every open window on every single push, which is `ChatScreen`'s refresh signal, not a
     * destination. */
    sw.post({ type: SW_MESSAGE_TYPE })
    sw.post({ type: SW_MESSAGE_TYPE, url: '/nina' })

    expect(routerPush).not.toHaveBeenCalled()
  })

  it('ignores anything that is not a message of this shape', () => {
    const sw = installContainer()
    render(<PushTapNavigator />)

    sw.post(null)
    sw.post('nina:navigate')
    sw.post({ url: '/nina' })
    sw.post({ type: 'some-other-worker', url: '/nina' })
    sw.post({ type: SW_NAVIGATE_MESSAGE_TYPE })
    sw.post({ type: SW_NAVIGATE_MESSAGE_TYPE, url: 42 })

    expect(routerPush).not.toHaveBeenCalled()
  })

  it('refuses a url that is not a same-origin path', () => {
    const sw = installContainer()
    render(<PushTapNavigator />)

    /* A registered worker outlives the deploy that shipped it, and the string came off the
     * network. `//host/path` is the one that matters: it starts with `/` and is not us. */
    sw.post({ type: SW_NAVIGATE_MESSAGE_TYPE, url: 'https://evil.example/nina' })
    sw.post({ type: SW_NAVIGATE_MESSAGE_TYPE, url: '//evil.example/nina' })
    sw.post({ type: SW_NAVIGATE_MESSAGE_TYPE, url: 'nina' })

    expect(routerPush).not.toHaveBeenCalled()
  })

  it('takes its listener with it when it unmounts', () => {
    const sw = installContainer()
    const { unmount } = render(<PushTapNavigator />)
    expect(sw.count()).toBe(1)

    unmount()
    expect(sw.count()).toBe(0)

    sw.post({ type: SW_NAVIGATE_MESSAGE_TYPE, url: '/nina' })
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('renders on a browser with no service worker at all', () => {
    /* No `installContainer()`: `/login` in a browser that has never heard of a service worker still
     * has to render, and the guard is what makes the root layout safe to mount this from. */
    const { container } = render(<PushTapNavigator />)
    expect(container.firstElementChild).toBeNull()
    expect(routerPush).not.toHaveBeenCalled()
  })
})
```

**Impact:** seven cases, no timers, no `act` beyond what `render`/`unmount` already wrap (nothing
in the component sets React state, so dispatching outside `act` is safe). `routerPush.mockReset()`
in `beforeEach` — not `clearAllMocks` — matches the repo's reset discipline.

**Not tested, deliberately:** `lib/service-worker.js` itself. It is a `ServiceWorkerGlobalScope`
script — uncompiled, unimported, outside `tsconfig`'s `include`, with `self` as a global the test
environment does not provide. The codebase's standing precedent is to reason about that file by
hand and to pin only its *contract with the app* (`lib/nina/live.test.ts`'s literal assertions),
which Step 2 extends. Inventing a harness for it is out of scope for this phase.

---

## Verification

**Build:**
```
npm run typecheck          # next typegen && tsc --noEmit
npm run lint
npm run format:check
```

**Tests:**
```
npx vitest run components/push/PushTapNavigator.test.tsx lib/nina/live.test.ts
npm test                   # full suite — nothing else should move
```

**Manual check (the repro, end to end):**
1. `npm run dev`, open the app, go to `/me`, "Turn on notifications".
2. Navigate to `/nina/about` and open a photo full-screen (the `?photo=` overlay).
3. From `/me` in a second tab — or via the card's "Send me a test" — fire a push.
4. Tap the notification. The window comes forward **and** lands on `/nina`, with the overlay gone
   and no full-page reload (the app does not flash a cold start; React state elsewhere survives).
5. Repeat standing on `/photo/<kind>/<id>` — a route `AppShell` does not wrap — and confirm it
   behaves identically. That is the case a per-screen fix would have missed.
6. Open the service worker's console (DevTools → Application → Service Workers → inspect) and
   confirm **no** "Uncaught (in promise) TypeError" appears on a tap.
7. Standing on bare `/nina` with no query string, tap: the window is focused and nothing navigates
   (no reload, no scroll jump).

**Exit criteria:**
- `notificationclick` contains no call to `WindowClient.navigate()`, and every promise it starts is
  terminated by a `.catch()` — for all of (controlled | uncontrolled) × (pathname matches | does
  not) × (window exists | does not).
- A tap from `/nina/about` with the photo overlay open lands on `/nina` as a client-side
  navigation.
- `PushTapNavigator` is mounted exactly once, from `app/layout.tsx`, and is present on a route
  `AppShell` does not wrap.
- `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test` are all green.

---

## Handoffs

- **R2 / Phase 2 (deep-link the payload).** Every step above routes to whatever `url` the payload
  carries and takes no position on what that value should be. Threading `sessionId` into
  `buildNinaPushPayload` so the url becomes `/nina?s=<sessionId>&jump=<messageId>` is Phase 2's
  work, in `lib/push/*`, `lib/nina/{turnrun,imagerun,imagejobs,proactive}.ts`,
  `lib/admin/chatPhotoActions.ts` and `scripts/nina-image-worker/*` — none of which this phase
  opens. **Phase 2 needs no edit to `lib/service-worker.js`:** the `push` handler's
  `data.url.startsWith('/')` guard already passes a query-carrying path, and Step 3's comparison is
  over `pathname + search`, so it is query-correct on the day Phase 2 lands.
- **LAND THIS PHASE FIRST, or land both together (reconciler).** There is no `depends_on` edge —
  both phases build and test green alone, and they share no file — but the *merge* order is not
  symmetric. On `main` today exactly one case works: standing on bare `/nina`, where
  `url.pathname === target` (`'/nina' === '/nina'`) matches and the handler focuses. If Phase 2
  merges alone, its `target` becomes `/nina?s=…&jump=…` while `url.pathname` never carries a query,
  that branch stops matching, and the tap falls into the `navigate()` call that rejects — so the
  one working case breaks until this phase lands. This phase merging first (or with Phase 2) closes
  that window; Step 3's `pathname + search` comparison is what makes the pair correct in either
  order afterwards. Build order stays parallel; merge order does not.
- **Deploy-window transient.** A tab still running a pre-phase-1 page bundle has no
  `PushTapNavigator` and will focus without navigating until it reloads. Recorded, not mitigated —
  see Step 3's Impact for why a second navigation mechanism is not worth a one-deploy window.
- **`clients.claim()` / an `activate` handler.** Would independently fix `navigate()`, and is
  explicitly refused by the plan index's Decisions table (rung 1, plan invariant 2). Left alone; if
  a future phase ever adds a caching worker, that phase owns the decision, not this one.
- **`ChatScreen`'s `nina:new` listener.** It is the precedent this phase copies and is now the
  *only* remaining consumer of `SW_MESSAGE_TYPE`. Not consolidated with the new listener: the two
  answer different events (refresh-in-place vs navigate) and live at different depths (one route vs
  every route). No cleanup implied.
- **`components/push/` has no barrel.** `PushSetup`/`PushSetupCard` are imported by path and so is
  the new component. Adding an `index.ts` would be a drive-by; not done.

---

## Rollback

Each change is additive or a single-block replacement, in files no other phase touches:

1. `git checkout -- lib/service-worker.js app/layout.tsx lib/nina/live.ts lib/nina/live.test.ts`
2. `rm components/push/PushTapNavigator.tsx components/push/PushTapNavigator.test.tsx`

Or revert this phase's commit(s) wholesale. Nothing here writes to the database, adds a migration,
or changes the push wire format, so the rollback is a pure code revert — a phone holding a
notification minted under either version reads `data.url` the same way. Reverting leaves
`notificationclick` exactly as it is on `main` today (still broken for R1) and leaves Phase 2's
files untouched either way.
