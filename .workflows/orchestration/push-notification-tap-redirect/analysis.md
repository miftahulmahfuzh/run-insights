# Code Analysis: Push Notification Tap → Redirect

**Type:** Bug Investigation (with a Feature Update component — the deep-link payload)
**Date:** 2026-09-16 08:41 WIB
**Session ID:** 20260916-084124-N9QZ
**Plan:** `PUSH_NOTIFICATION_TAP_REDIRECT_PLAN.md` (2 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/push-notification-tap-redirect` (branch `feature/push-notification-tap-redirect`, base `origin/main` @ `f48a941`)

---

## User Input

### Original User Request

> we have push notification now. and it works.
> BUT there is a problem that if i am in some page in our app, for example, when i am viewing full
> a screen image in /nina/about Media, then i see a notif popped out, i couldn't click the
> notification.
> requirement: make it so, dimanapun user berada di app, baik ketika melihat foto, chat di chat
> session lain, liat profpic nina, anything. make sure user can click the push notification from
> their phone and be redirected to the correct bubble in the correct chat session.

### User-Provided Context

None beyond the prose above — no error message, no stack trace, no log excerpt. The repro is
behavioural: stand on `/nina/about` with the full-screen photo overlay open (`?photo=album.<id>`
or `?photo=chat.<id>` on that page's own URL), receive a push, tap it, observe nothing happen.

### User-Provided Files

None (`@`-referenced).

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | Tapping a push notification must actually bring the app to the foreground and navigate, **no matter what screen or overlay the user is currently on** (a full-screen photo, another chat session, Nina's profile picture, or "anything") — today it silently does nothing from most screens. |
| R2 | The tap must land on **the correct bubble in the correct chat session** — not just the chat tab in general. |

---

## Detailed Requirements Understanding

**Problem/Requirement Statement.** Web Push already works end-to-end: a payload is sent, the
service worker shows a notification, and `notificationclick` already contains logic that tries to
focus or navigate an open window. Two independent defects sit under the single symptom "I couldn't
click the notification":

1. **The click handler's own navigation call silently fails from most screens (R1).** The Service
   Worker's `notificationclick` handler calls `WindowClient.navigate(target)` on whichever open
   window it finds via `clients.matchAll(...)`. Per the Service Worker spec, `navigate()` rejects
   with a `TypeError` when the calling worker does not **control** that client
   (confirmed via web search against the W3C Service Worker spec and MDN's `WindowClient.navigate()`
   reference — see Requirements Understanding below for the exact mechanism). This app's service
   worker (`lib/service-worker.js`) deliberately has **no `install`/`activate` handler and therefore
   no `clients.claim()`** — a design choice stated explicitly in the file's own header ("No
   install, no activate, no fetch..."). Without `clients.claim()`, a window that was already open
   before the current worker became active is **uncontrolled**, and this is the ordinary case for a
   PWA kept open for hours or days: the tab the runner is reading right now was almost certainly
   loaded before this exact worker instance took over. The existing code calls
   `client.navigate(target).then(...)` with **no `.catch()`** — when that promise rejects, the
   rejection is unhandled inside `event.waitUntil()`, the notification has already closed
   (`event.notification.close()` ran first), and nothing else happens. This reproduces on **every**
   screen except the one case where `url.pathname === target` happens to already match (i.e., the
   runner happens to already be on bare `/nina` with no query string) — which is exactly why the
   user's repro (`/nina/about`, a different pathname) fails, and why "wherever I am" is the accurate
   frame for the bug.

2. **Even when a tap does navigate, it only ever goes to bare `/nina` (R2).** Every push kind
   except `duplicate_image` calls `buildNinaPushPayload` without a `url`, which falls back to
   `PUSH_TARGET_URL = '/nina'`. `/nina` without `?s=` opens `chooseActiveSession`'s default (the
   most-recently-active session), not necessarily the session the notification was about, and with
   no `?jump=` there is no scroll-to-bubble at all. The codebase already has the exact mechanism this
   needs — `/nina?s=<sessionId>&jump=<messageId>`, built by `ninaJumpHref` (`lib/nina/jobview.ts`)
   and consumed by `useQuoteLanding.ts`'s scroll-and-flash landing, the same one `/nina/jobs/[id]`'s
   "Buka chat-nya" link and search hits already use — but no push call site plugs a `sessionId`
   into `buildNinaPushPayload`, even though every one of them has the session id sitting in scope
   at the moment it calls `notifyNinaPush`/`pushNotifier`/`sendWorkerPush`.

**Success Criteria.**
- Tapping a Nina push notification, from any current page or overlay in the app (any tab, any
  session's chat, the full-screen photo viewer, `/nina/about`, `/nina/jobs`, `/me`, `/photo/...`),
  reliably brings an open window to the foreground and to `/nina` — with no unhandled rejection and
  no silent no-op.
- If no window is open at all, a new one opens at the right destination (existing `openWindow`
  fallback, unaffected by this plan).
- The destination for every chat-shaped push kind (`chat_reply`, `photo_delivered`,
  `photo_apology`, `admin_chat_photo`, and the five proactive triggers) is
  `/nina?s=<sessionId>&jump=<messageId>` — the session the message was written into, and the exact
  bubble the notification's body was drawn from — so the existing `useQuoteLanding` scroll-and-flash
  lands on it exactly the way "Buka chat-nya" and a search hit already do.
- `duplicate_image` is unaffected: it is not about a bubble, and keeps its own
  `/photo/<kind>/<id>` destination.
- No full-page reload where one can be avoided — the app is an SPA and a hard navigate away from,
  say, a full-screen photo overlay is a visibly worse experience than a client-side route change.

**Key Considerations / Constraints.**
- `lib/service-worker.js` is plain `.js`, bundled by Next as an asset (`new URL(...)`), not
  type-checked, and cannot import from `lib/`. Any shared vocabulary (message-type strings) it needs
  must be a literal restated on both sides, "kept in step" — the file's own established idiom
  (`FALLBACK_URL`, `FALLBACK_TAG`, `LIVE_MESSAGE_TYPE` are already restated this way against
  `lib/push/payload.ts` and `lib/nina/live.ts`).
- `lib/push/payload.ts` carries **no `server-only`** and does no I/O, specifically so it can be
  loaded two ways: through the Next app's `@/` alias, and through a **relative** specifier from
  `scripts/nina-image-worker/` under `node --experimental-strip-types` (no bundler, no path-alias
  resolution, no `@/`). Any change to the push-URL grammar that both the app and the worker must
  agree on belongs in this file, or it becomes two drifting copies.
- The off-platform worker (`scripts/nina-image-worker/push.ts`, called from `finish.ts`) has its own
  restated copy of the send pipeline (`sendWorkerPush`) because it cannot import
  `lib/push/send.ts` (`server-only`, `@/lib/env`, `@/lib/push/queries`). It already has `sessionId`
  in scope at both its call sites (`finish.ts`'s selfie-finish and its apology path) and needs the
  same threading.
- `ProactiveNotifier` (`lib/nina/proactive.ts`) is a 3-argument type
  (`userId, messages, kind`) with no session slot. Widening it to add an optional 4th `sessionId`
  parameter is the only way the five proactive trigger kinds can deep-link, since `pushNotifier`'s
  call to `sendNinaPush` cannot receive an argument its declared type does not carry. This is a
  narrow, additive, backward-compatible widening (optional parameter), not a redesign.
- The full-screen photo viewer on `/nina/about` (the user's own repro) is a **client-side overlay**
  driven by a `?photo=` query param on `/nina/about`'s own URL (`NinaAboutScreen.tsx` +
  `components/ui/PhotoViewer.tsx`), not a separate route. A notification tap from there must leave
  that pathname entirely (`/nina/about` → `/nina`), which an ordinary Next.js client-side navigation
  (`router.push`) already handles correctly (unmounts the overlay along with the rest of the page).
- `navigator.serviceWorker.addEventListener('message', ...)`, registered from a plain client
  component, works **whether or not the page is controlled by the worker** — this is a different,
  uncontrolled-safe channel from `WindowClient.navigate()`, and the app already uses it
  (`ChatScreen.tsx`'s existing `nina:new` listener, documented at `components/nina/ChatScreen.tsx:412`
  as working "whether or not this page is controlled by the worker"). This is the mechanism R1's fix
  should reuse, rather than depending on `navigate()`'s controlled-client requirement at all.
- `ChatScreen`'s existing message listener only exists while `/nina` is mounted. The requirement is
  "wherever the user is" — the full list of routes that do **not** render `ChatScreen` includes
  every screen `AppShell` wraps (`/`, `/nina/about`, `/trends`, `/me`, `/nina/jobs`, `/r/[id]`) *and*
  the handful that render no `AppShell` at all (`/photo/[kind]/[id]`, `/upload`, `/onboarding`,
  `/admin/*`, `/x/[extractionId]`). A per-screen fix would miss the second group entirely, so the
  listener belongs at `app/layout.tsx` (the one component that wraps literally everything), not
  inside `AppShell`.

---

## Analysis Scope

### Explicitly Mentioned Files
None — the user described a symptom, not a file.

### Discovered Related Files

**Service worker / click handling (R1)**
- `lib/service-worker.js` — the entire push + notificationclick implementation.
- `components/push/PushSetupCard.tsx` — registers the worker (once, on `/me`), subscribes.
- `components/push/PushSetup.tsx` — server wrapper reading `pushEnv()` / subscription count.
- `lib/nina/live.ts` — `SW_MESSAGE_TYPE = 'nina:new'`, the existing SW→window message contract.
- `components/nina/ChatScreen.tsx:405-433` — the existing, working precedent for an
  uncontrolled-safe `navigator.serviceWorker` message listener.
- `app/layout.tsx` — the root layout; the one place that wraps every route.
- `components/ui/AppShell.tsx` — wraps most, but not all, screens (see Key Considerations).

**Push payload / URL grammar (R2)**
- `lib/push/payload.ts` — `buildNinaPushPayload`, `PUSH_TARGET_URL`, `NinaPushPayload.url`.
- `lib/push/send.ts` — `sendNinaPush`, `notifyNinaPush`, `NinaPushNotifier`, `pushNotifier`.
- `lib/nina/active.ts` — `SESSION_PARAM = 's'`.
- `lib/nina/jobview.ts` — `JOB_JUMP_PARAM = 'jump'`, `ninaJumpHref({sessionId, messageId,
  sessionParam})` — the existing, tested deep-link builder this plan reuses/mirrors.
- `components/nina/useQuoteLanding.ts` — consumes `?s=` + `?jump=` on arrival; the landing this
  plan's URLs must keep hitting.
- `lib/nina/turnrun.ts` — `chat_reply` push call site (`runNinaBackgroundTurn`), has `sessionId`
  in scope (its own input field).
- `lib/nina/imagerun.ts` — `photo_delivered` push call site (`finishSelfie`), `sessionId` in scope
  since line 303.
- `lib/nina/imagejobs.ts` — `photo_apology` push call site (`postNinaApologyMessage`), computes its
  own `sessionId` locally.
- `lib/admin/chatPhotoActions.ts` — `admin_chat_photo` push call site (`addChatPhotoAction`),
  `sessionId` in scope since line 348.
- `lib/nina/proactive.ts` — `ProactiveNotifier` type, `pushNotifier`, `emitProactiveMessage` (its
  own `sessionId` parameter, in scope at the `notify(...)` call).
- `lib/push/duplicateImage.ts` — `notifyDuplicateImagePush`, the ONE existing caller that already
  passes an explicit `url` (`/photo/<kind>/<id>`) — unaffected by this plan, and the precedent for
  "an explicit `url` wins over a derived one."
- `scripts/nina-image-worker/push.ts` — `sendWorkerPush`, `WorkerNotifier` — the worker's restated
  send pipeline; needs the same `sessionId` threading.
- `scripts/nina-image-worker/finish.ts` — two call sites (`finishSelfie`'s worker twin, and the
  apology path around line 371-385), both with `sessionId` already resolved locally
  (`resolveWorkerSessionId`).

---

## Current Dataflow

### Push send (unchanged by R1, extended by R2)

Every push kind funnels into `buildNinaPushPayload({ messages, kind, url? })`
(`lib/push/payload.ts:283`), which picks the first non-blank message as `messageId`/body source and
defaults `url` to `PUSH_TARGET_URL` (`'/nina'`) when the caller passes none. `encodeNinaPushPayload`
stringifies it; `sendNinaPush`/`sendWorkerPush` POST it (encrypted, per RFC 8291) to every live
subscription.

Seven call sites build a payload today:

| Kind | Call site | `sessionId` already in scope? |
|---|---|---|
| `chat_reply` | `lib/nina/turnrun.ts` (`runNinaBackgroundTurn`, via `notify(userId, bubbles, 'chat_reply')`) | Yes — `input.sessionId` |
| `photo_delivered` | `lib/nina/imagerun.ts:496` (`finishSelfie`) | Yes — local `sessionId` (line 303) |
| `photo_apology` | `lib/nina/imagejobs.ts:666` (`postNinaApologyMessage`) | Yes — local `sessionId` |
| `admin_chat_photo` | `lib/admin/chatPhotoActions.ts:508` (`addChatPhotoAction`) | Yes — local `sessionId` (line 348) |
| `run_committed` / `missed_usual_day` / `pattern_crossed` / `silence` / `avatar_changed` | `lib/nina/proactive.ts:703` (`emitProactiveMessage`, via `notify(userId, bubbles, detail.kind)`) | Yes — the function's own `sessionId` parameter, but **not reachable through `ProactiveNotifier`'s current 3-arg type** |
| `duplicate_image` | `lib/push/duplicateImage.ts` (`notifyDuplicateImagePush`) | N/A — already passes its own `url`, not session-shaped |
| `worker_photo_delivered` / `worker_photo_apology` | `scripts/nina-image-worker/finish.ts` (two sites), via `sendWorkerPush` | Yes — `resolveWorkerSessionId` result, local at both sites |

None of the six chat-shaped rows passes a `url`, so all six currently produce `NinaPushPayload.url
=== '/nina'`.

### Push receive → notification tap (R1's defect)

`lib/service-worker.js`'s `push` listener builds `options.data = { url, messageId, kind }` from the
wire payload (defensive reads; `url` falls back to `FALLBACK_URL = '/nina'` if the payload's isn't a
same-origin path) and calls `showNotification`.

`notificationclick`:
```js
self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || FALLBACK_URL
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (const client of clientList) {
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
```

- `matchAll({ includeUncontrolled: true })` is why an uncontrolled window is *found* at all — the
  file's own header explains this half.
- Nothing explains, or handles, the fact that **`client.navigate()` itself requires the client to
  be controlled**, independent of whether `matchAll` could see it. `includeUncontrolled` only
  affects discovery, not what `navigate()` is willing to do to what was discovered.
- `client.navigate(target).then(...)` has no `.catch()`. A `TypeError` rejection here propagates out
  of the `.then()` chain, out of `event.waitUntil()`'s promise, unhandled — the browser logs an
  "Uncaught (in promise)" in the service worker's own console (invisible to the runner) and performs
  no fallback action. The notification is already closed by this point. **This is the entire
  mechanism behind "I couldn't click the notification."**
- The `url.pathname === target` check is itself about to become unreliable once R2 ships: `target`
  will carry a query string (`/nina?s=...&jump=...`) while `url.pathname` never does, so the branch
  that currently catches "I'm already on the exact right screen" will stop matching for every
  chat-shaped push — not a regression in the sense of breaking something that worked, since the
  underlying `navigate()` branch is broken anyway, but it does mean **both** defects must be fixed
  together for the "already on `/nina` in the right session" case to behave well (focus only, no
  navigation) rather than force a navigate/reload every time.

### The established deep-link grammar (reused, not invented)

`ninaJumpHref` (`lib/nina/jobview.ts:80-101`):
```ts
export function ninaJumpHref(input: {
  sessionId: string
  messageId: string
  sessionParam: string   // SESSION_PARAM, passed in so this module declares no second 's'
}): string {
  const params = new URLSearchParams()
  params.set(input.sessionParam, input.sessionId)
  params.set(JOB_JUMP_PARAM, input.messageId)
  return `/nina?${params.toString()}`
}
```
Consumed by `useQuoteLanding.ts` (`components/nina/useQuoteLanding.ts`), which reads `?jump=` on
mount (one-shot, ref-held) and on same-session soft navigation, scrolls the named bubble into the
band above the composer, and flashes it (`nina-flash-blink`). This is precisely "click and directly
pinpoint" — the user's own phrase for the existing quote-tap behaviour — already generalized once
for `/nina/jobs/[id]`'s "Buka chat-nya" link and for search hits (`lib/nina/search.ts:364`).

`lib/push/payload.ts` cannot import `ninaJumpHref` for the worker's sake (see Dependencies below),
so the two worlds need the same grammar built two ways: the app-side callers via the existing
`ninaJumpHref`, and `payload.ts`/the worker via a restated literal — the same trade `push.ts` already
takes for `WORKER_PUSH_TTL_SECONDS` (a comment-linked duplicate of `PUSH_TTL_SECONDS`, because the
shared module cannot be reached).

---

## Key Data Structures

### `NinaPushPayload` (`lib/push/payload.ts:231`)
```ts
export interface NinaPushPayload {
  v: 1
  title: string
  body: string
  url: string        // same-origin path; what a tap should open
  tag: string
  messageId: string | null
  kind: string
}
```
No shape change needed for this plan — `url` already carries an arbitrary same-origin path.
`buildNinaPushPayload`'s *inputs* gain a new optional `sessionId`.

### `ProactiveNotifier` (`lib/nina/proactive.ts:481`)
```ts
export type ProactiveNotifier = (
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: ProactiveTriggerKind,
) => Promise<void>
```
Widened by this plan to a 4th optional `sessionId?: string`.

### `NinaPushNotifier` (`lib/push/send.ts:226`) / `NinaTurnNotifier` (`lib/nina/turnrun.ts`) /
`WorkerNotifier` (`scripts/nina-image-worker/push.ts:138`)
All three are `(userId, messages, kind, ...) => Promise<...>` shapes that presently end at `kind` or
an optional `url`. Each gains one more optional trailing parameter for `sessionId`.

---

## Dependencies

### Configuration / Environment
No new env vars. `VAPID_*` unchanged.

### Cross-module import constraints (load-bearing for the phase split)
- `lib/service-worker.js`: no imports at all from `lib/`; any shared string is a restated literal.
- `lib/push/payload.ts`: no `server-only`, imports only `zod`; loaded both via `@/` (app) and via a
  relative specifier (worker, `node --experimental-strip-types`). Cannot import `lib/nina/*` or
  `lib/nina/jobview.ts` (which itself imports `@/lib/id` and `@/lib/nina/sessions`).
- `scripts/nina-image-worker/*.ts`: `.ts`-suffixed relative imports only, no `@/` aliases, no
  `server-only`. Already restates constants from files it cannot import (`WORKER_PUSH_TTL_SECONDS`).
- `lib/nina/proactive.ts`: type-only import of `pushNotifier`'s module (`lib/push/send.ts`) to avoid
  a runtime require-cycle; unaffected by this plan's changes (still type-only).

---

## Reference List

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `notificationclick` handler | `lib/service-worker.js:144-170` | impl | root |
| `LIVE_MESSAGE_TYPE` | `lib/service-worker.js:48` | def | root |
| `SW_MESSAGE_TYPE` | `lib/nina/live.ts:28` | def | lib/nina |
| SW message listener (`nina:new`) | `components/nina/ChatScreen.tsx:423-433` | impl (precedent) | components/nina |
| `PUSH_TARGET_URL` | `lib/push/payload.ts:20` | def | lib/push |
| `buildNinaPushPayload` | `lib/push/payload.ts:283-311` | def/impl | lib/push |
| `NinaPushPayload.url` | `lib/push/payload.ts:236` | def | lib/push |
| `sendNinaPush` | `lib/push/send.ts:151-202` | impl | lib/push |
| `NinaPushNotifier` / `notifyNinaPush` | `lib/push/send.ts:226,245` | def/impl | lib/push |
| `pushNotifier` | `lib/push/send.ts:266-280` | impl | lib/push |
| `SESSION_PARAM` | `lib/nina/active.ts:36` | def | lib/nina |
| `JOB_JUMP_PARAM` | `lib/nina/jobview.ts:68` | def | lib/nina |
| `ninaJumpHref` | `lib/nina/jobview.ts:80-101` | def/impl | lib/nina |
| `useQuoteLanding` (`?jump=` consumer) | `components/nina/useQuoteLanding.ts` | impl | components/nina |
| `NinaTurnNotifier` / call site | `lib/nina/turnrun.ts` (type decl + `runNinaBackgroundTurn`) | def/call | lib/nina |
| `photo_delivered` call | `lib/nina/imagerun.ts:496` (`finishSelfie`, `sessionId` since :303) | call | lib/nina |
| `photo_apology` call | `lib/nina/imagejobs.ts:666` (`postNinaApologyMessage`) | call | lib/nina |
| `admin_chat_photo` call | `lib/admin/chatPhotoActions.ts:508` (`sessionId` since :348) | call | lib/admin |
| `ProactiveNotifier` / `notify(...)` call | `lib/nina/proactive.ts:481`, `:703` | def/call | lib/nina |
| `notifyDuplicateImagePush` | `lib/push/duplicateImage.ts` | call (unaffected) | lib/push |
| `sendWorkerPush` / `WorkerNotifier` | `scripts/nina-image-worker/push.ts:138,286-393` | def/impl | scripts |
| worker call sites | `scripts/nina-image-worker/finish.ts` (~125-182 selfie, ~371-385 apology) | call | scripts |
| `AppShell` | `components/ui/AppShell.tsx` | impl (partial coverage only) | components/ui |
| root layout | `app/layout.tsx` | impl (full coverage) | app |
| photo overlay (user's repro) | `components/nina/NinaAboutScreen.tsx`, `components/ui/PhotoViewer.tsx` | impl | components/nina, components/ui |
| `lib/push/payload.test.ts` | test | test | lib/push |
| `lib/push/send.test.ts` | test | test | lib/push |
| `tests/nina.imageworker.test.ts` | test | test | tests |

---

## Impact Points (files that WILL need changes)

**Phase 1 (R1 — click must work from anywhere):**
1. `lib/service-worker.js` — rewrite `notificationclick`: focus (always works, control-independent)
   + `postMessage` a new nav message type to the focused/found client, catch any `navigate()` /
   focus failure, fall back to `openWindow` only when no window client exists at all.
2. `lib/nina/live.ts` — add the sibling constant for the new SW→window navigation message type,
   beside `SW_MESSAGE_TYPE`.
3. New client component (app-wide message listener, `router.push`) + wiring it into
   `app/layout.tsx` so every route — including the ones `AppShell` does not wrap — is covered.
4. New test file for the new listener component.

**Phase 2 (R2 — correct bubble, correct session):**
5. `lib/push/payload.ts` — `buildNinaPushPayload` gains `sessionId?`; deep-link builder restated
   for the worker's sake.
6. `lib/push/send.ts` — thread `sessionId?` through `sendNinaPush` / `NinaPushNotifier` /
   `notifyNinaPush`.
7. `lib/nina/turnrun.ts` — thread through `NinaTurnNotifier` + the `chat_reply` call site.
8. `lib/nina/imagerun.ts` — pass `sessionId` at the `photo_delivered` call site.
9. `lib/nina/imagejobs.ts` — pass `sessionId` at the `photo_apology` call site.
10. `lib/admin/chatPhotoActions.ts` — pass `sessionId` at the `admin_chat_photo` call site.
11. `lib/nina/proactive.ts` — widen `ProactiveNotifier` with optional `sessionId`; pass it through
    `pushNotifier` and from `emitProactiveMessage`'s `notify(...)` call.
12. `scripts/nina-image-worker/push.ts` — thread `sessionId?` through `sendWorkerPush` /
    `WorkerNotifier`.
13. `scripts/nina-image-worker/finish.ts` — pass `sessionId` at both call sites.
14. Corresponding test updates: `lib/push/payload.test.ts`, `lib/push/send.test.ts`,
    `lib/nina/turnrun.test.ts` (if it asserts notifier args), `lib/admin/chatPhotoActions.test.ts`
    (if applicable), `lib/nina/proactive.test.ts` (if applicable), `tests/nina.imageworker.test.ts`.

**This document describes. The plan files prescribe.**
