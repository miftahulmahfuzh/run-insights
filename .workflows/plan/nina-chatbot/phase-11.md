# Phase 11: Web Push and the first service worker

> ## ⚠ RECONCILIATION — binding rulings not yet folded into the body of this plan
>
> `.workflows/plan/nina-chatbot/RECONCILIATION_RULINGS.md` is **normative** and outranks anything
> below it. Relevant here:
>
> - **C4 — `VAPID_SUBJECT` is yours to add to `pushEnv()`**; phase 1 predicted the ask and left it.
> - **A1 — the DTO boundary.** `lib/nina/queries.ts` speaks `body`/`createdAt`.
> - **B1 — the final `sendNinaMessage` signature** is one combined object; if your live-arrival work
>   touches it, read B1 rather than the shape quoted here.
> - **Invariant 10 stands:** the VAPID public key reaches the client as a **prop**, never as
>   `NEXT_PUBLIC_`. This is the one Next-documented pattern this repo deliberately does not follow.


**Plan set:** `NINA_CHATBOT_PLAN.md`
**Analysis:** `20260903-140308-N1NA_code_analyzer.md`
**Satisfies:** R3 — proactivity is the iron rule. Phase 10 made Nina speak unprompted; this phase
makes the phone buzz, so she reaches the runner when the app is closed.
**Depends on:** Phase 1 (the `push_subscriptions` table, `pushEnv()`), Phase 10 (`ProactiveNotifier`
and the `NOOP_NOTIFIER` seam, `nina_messages.read_at`)
**Difficulty:** HARD
**Package:** `lib/push` (plus `lib/service-worker.js`, `components/push/`, `next.config.ts`)

---

## Goal

After this phase the app has a service worker — its first — and a runner who taps "Turn on
notifications" on `/me` gets a real Web Push notification when Nina writes to him while the app is
closed. Tapping it opens `/nina`, focusing an already-open window rather than stacking a second
one. A message that arrives while `/nina` is already open appears without a reload. A subscription
the browser has revoked is pruned instead of retried forever, and the VAPID public key reaches the
browser as a prop rather than as a `NEXT_PUBLIC_` variable, so `ci:client-secret-guard` stays
honest.

---

## READ THIS FIRST: the one place this plan deliberately contradicts Next's own guide

`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` is the recipe this phase
follows, with **three deliberate deviations**. Two are corrections to the guide, one is a repo
invariant. All three are written into the code comments as well as here, because the next reader's
instinct will be to "fix" them back.

### Deviation 1 — the VAPID public key is a PROP, not `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

The guide's client component reads `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` (guide §2 and §3).
**This repo forbids the `NEXT_PUBLIC_` prefix outright.** `scripts/check-client-secret-boundary.mjs`
RULE 3 greps `app/`, `lib/` and `components/` for that literal on any executable line and fails
unconditionally, per ROADMAP §4.1. That is plan **invariant 10**, and it is the one documented
invariant that collides with Nina and is **NOT** repealed (`NINA_CHATBOT_PLAN.md:190`).

So: `components/push/PushSetup.tsx` is a **server** component that calls phase 1's `pushEnv()` and
passes `vapidPublicKey` down to the client `PushSetupCard` as a prop. The value reaches the browser
either way — a VAPID public key is public by construction, it is in every subscription request.
The difference is that the guard does not have to grow an exception, and nobody later reads a
`NEXT_PUBLIC_` in this codebase and concludes the rule is soft.

**Do not add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` to `.env.example`, to Vercel, or to any file.**

### Deviation 2 — the header matcher is `/_next/static/service-worker/:path*`, not `/sw.js`

The guide's §8 security block sets headers on `source: '/sw.js'`. That matcher is for a
hand-placed `public/sw.js`, and §2 of the same guide registers a **bundled module**
(`new URL('../lib/service-worker.js', import.meta.url)`). The two halves of the guide disagree, and
the bundled half is the one to follow.

Verified in this exact Next (16.3.1), not assumed:

- `node_modules/next/dist/build/index.js:1657-1673` — *"Service workers are compiled into
  `distDir/static/service-worker/` and register at a broader scope than their own directory (e.g.
  `/`), so their script response needs a `Service-Worker-Allowed` header"* — and the build pushes
  exactly that header for `source: '/_next/static/service-worker/:path*'` as an `internal` route.
- `node_modules/next/dist/server/lib/router-server.js:434-437` — dev/start serves that directory
  with `Cache-Control: public, max-age=0, must-revalidate` and
  `Service-Worker-Allowed: <basePath || '/'>`.
- `node_modules/next/dist/server/lib/router-utils/resolve-routes.js:313-316` — *"Service workers
  are served at a fixed, stable URL (so the browser can keep the same registration across builds),
  so they don't carry a `?dpl` token."*

Three consequences, and they are the reason this deviation matters rather than being pedantry:

1. **`Service-Worker-Allowed: /` is already supplied by Next.** Do not add it by hand; a duplicate
   header on the same response is how a scope error becomes intermittent. `{ scope: '/' }` in the
   `register()` call works *because* of Next's internal route, not because of anything in this
   phase.
2. **`Cache-Control` is already `max-age=0, must-revalidate`.** The guide's `no-cache, no-store,
   must-revalidate` is stricter and is what this phase serves anyway, because `no-store` is the
   only value that also forbids a corporate proxy from holding a stale worker — and a stale
   service worker is the single worst artefact this feature can leave on a phone. It is set
   explicitly so the value is visible in `next.config.ts` next to the reason, rather than being an
   invisible framework default that a Next upgrade could change. Next only sets its default
   `if (!res.getHeader('cache-control'))`, so an explicit entry wins cleanly.
3. **The URL is stable across deploys but is NOT `/sw.js`.** Do not put `/sw.js` in a matcher, in a
   `register()` call, or in a bug report.

### Deviation 3 — no global header block

The guide's §8 also adds `X-Content-Type-Options`, `X-Frame-Options` and `Referrer-Policy` on
`source: '/(.*)'`. **Out of scope here.** `next.config.ts` currently sets `Referrer-Policy` on
exactly one route (`/s/:token`) with three paragraphs explaining why the pathname is the bearer
token, and turning that into an app-wide policy is a security decision about the share feature, not
about push. It goes to Handoffs.

---

## Platform reality, stated plainly

**iOS 16.4+ delivers Web Push only to a PWA installed to the home screen.** Not to Safari, not to
a tab, not to a bookmark. The design target is an iPhone XS Max (`docs/design-brief.md`), so on the
user's own device **the install path is a prerequisite for this feature, not a nicety.**

`lib/pwa.ts` exists precisely because "Add to Home Screen" was producing a Safari bookmark with a
letter "R" tiled on it — read that file's header. That bug is fixed, and `tests/pwa.install.test.ts`
holds it fixed. What is missing is that nothing in the app has ever *told* the runner to install it,
because until now nothing depended on it.

So the iOS hint in this phase is **real, not decorative**:

- On iOS, in a browser tab (`display-mode: browser`), `PushSetupCard` renders the install
  instruction **instead of** a subscribe button, because a subscribe button there cannot work:
  `PushManager` is absent, so `subscribe()` would throw on tap.
- On iOS, installed (`display-mode: standalone`), it renders the subscribe button like everywhere
  else.
- Everywhere non-iOS with `PushManager`, it renders the subscribe button and no install nagging.

`lib/pwa.ts` gains **nothing**. It is deliberately runtime-free plain constants, and its header
notes that nothing there may reach for an image API key because `ci:openrouter-guard` greps
comments too. Push logic goes in `lib/push/`, and the install *copy* goes in the component that
renders it.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** nothing. No file is removed and no symbol disappears.

**Renames:** none.

**Creates — `lib/push/payload.ts`** (pure; **no** `server-only`, no DOM types, no db — this is the
invariant-6 testable core):

- `NinaPushPayload` (type), `PushSubscriptionInput` (type), `PushFailureVerdict` (type)
- `pushSubscriptionSchema` (zod), `parsePushSubscription`
- `buildNinaPushPayload`, `encodeNinaPushPayload`, `decodeNinaPushPayload`
- `classifyPushFailure`, `shouldRevokeSubscription`
- `truncateForNotification`
- constants: `PUSH_BODY_MAX_CHARS = 180`, `PUSH_NOTIFICATION_TAG = 'nina'`,
  `PUSH_TARGET_URL = '/nina'`, `PUSH_TITLE = 'Nina'`, `PUSH_FAILURE_LIMIT = 5`,
  `TERMINAL_PUSH_STATUS_CODES = [404, 410]`

**Creates — `lib/push/payload.test.ts`.**

**Creates — `lib/push/queries.ts`** (`server-only`; the only writer of `push_subscriptions`):

- `savePushSubscription(userId, input)`
- `listLivePushSubscriptions(userId)`
- `deletePushSubscription(userId, endpoint)`
- `recordPushSuccess(userId, id, at?)`
- `recordPushFailure(userId, id, verdict, failureCount, at?)` — **four required args**; see the note at the end of Step 6
- `countLivePushSubscriptions(userId)`
- type `LivePushSubscription`

**Creates — `lib/push/send.ts`** (`server-only`; Node runtime only):

- `sendNinaPush` — **this is the function phase 10's seam calls**
- `pushNotifier` — a `ProactiveNotifier` (phase 10's type) wrapping `sendNinaPush`
- `sendPushToSubscription`
- type `PushSendReport`

**Creates — `lib/push/actions.ts`** (`'use server'`):

- `subscribeToPushAction(input: { subscription: unknown; userAgent?: string | null })`
- `unsubscribeFromPushAction(input: { endpoint: string })`
- `sendTestPushAction()`
- type `PushActionResult`

**Creates — `lib/service-worker.js`** — the app's **first** service worker. Verified absent before
this phase: `grep -rn "serviceWorker" app lib components public` returns nothing. Two listeners,
`push` and `notificationclick`, and nothing else. No `install`, no `activate`, no `fetch`, no
caching, no Serwist.

**Creates — `lib/nina/live.ts`** (pure, no DOM, no db):

- `mergeServerMessages`, `SW_MESSAGE_TYPE = 'nina:new'`, type `LiveMessage`

**Creates — `lib/nina/live.test.ts`.**

**Creates — `components/push/PushSetup.tsx`** — `PushSetup` (async **server** component; reads
`pushEnv()`), `PushSetupFallback`.

**Creates — `components/push/PushSetupCard.tsx`** — `PushSetupCard` (`'use client'`).

**Signature changes:**

1. `lib/env.ts` — `pushEnv()`'s schema gains `VAPID_SUBJECT`. Phase 1 flagged this as mine:
   *"`web-push` needs a VAPID subject (`mailto:`) that `pushEnv()` does not carry; adding
   `VAPID_SUBJECT` there is one line and phase 11 should make it rather than hardcode a string"*
   (`phase-1.md:3565`). Return type goes from `{ VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY }` to
   `{ VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT }`. Additive; `PushEnv` widens with it.
2. `lib/nina/proactive.ts` (**phase 10's file**) — the `NOOP_NOTIFIER` default becomes
   `pushNotifier`. **One line**, exactly as phase 10 specified. `NOOP_NOTIFIER` itself is kept and
   still exported, because phase 10's tests pass it explicitly.
3. `components/nina/ChatScreen.tsx` (**phase 4's file, also touched by 3, 6, 7, 8, 10**) — **no
   prop change.** Two `useEffect`s and one `useRouter()` are added inside the component body, plus
   two imports. See Step 10 for the exact anchors and the collision note.

**Creates — `package.json` dependencies:** `web-push` at `3.6.7` (dependency),
`@types/web-push` at `3.6.4` (devDependency). Both pinned exactly, like everything else in the
file.

**Creates — config keys:** `VAPID_SUBJECT` (`.env.example`, Vercel). `VAPID_PUBLIC_KEY` and
`VAPID_PRIVATE_KEY` are phase 1's, already declared.

**Creates — `next.config.ts`:** one entry in `headers()` for
`/_next/static/service-worker/:path*`.

**Creates — `scripts/check-client-secret-boundary.mjs`:** `'VAPID_PRIVATE_KEY'` added to
`SECRETS`. `VAPID_PUBLIC_KEY` is deliberately **not** added — it is not a secret, and listing it
would make RULE 1 forbid the very server component that is supposed to read it if that component
were ever converted.

**Requires (from earlier phases).** Six items. Each is named so the reconciler can repair a
one-line drift rather than re-plan:

1. **Phase 1** — `lib/db/schema.ts` exports `pushSubscriptions` with columns
   `{ id, userId, endpoint, p256dh, auth, userAgent, lastSuccessAt, lastFailureAt, failureCount,
   revokedAt, createdAt }`, a unique index `push_subscriptions_endpoint_unq` on `endpoint`, and an
   index on `userId` (`phase-1.md:887-914`). Row types `PushSubscriptionRow` /
   `NewPushSubscriptionRow`.
2. **Phase 1** — `lib/env.ts` exports `pushEnv()` returning `VAPID_PUBLIC_KEY` and
   `VAPID_PRIVATE_KEY` (`phase-1.md:2203-2206`), and `load(group, schema)` / `nonEmpty(name)` are
   module-local helpers in that file (they are, `lib/env.ts:32` and `:110`).
3. **Phase 1** — `push_subscriptions` has **zero** query functions, deliberately
   (`phase-1.md:2102`). Every read and write against it is created here. If phase 1 shipped any,
   delete mine rather than duplicating.
4. **Phase 10** — `lib/nina/proactive.ts` exports `ProactiveNotifier =
   (userId: string, messages: ReadonlyArray<{ id: string; body: string }>, kind:
   ProactiveTriggerKind) => Promise<void>`, `NOOP_NOTIFIER`, and `ProactiveDeps.notify`, with the
   default resolved as `deps.notify ?? NOOP_NOTIFIER` inside `emitProactiveMessage`, called after
   the rows commit and inside its own `try` (`phase-10.md:917-928`, `:1018`, `:1065-1068`).
   `ProactiveTriggerKind` is a string union; my code accepts it as `string` and never switches on
   it, so a new trigger kind needs no edit here.
5. **Phase 10** — `app/nina/page.tsx` calls `after(() => markNinaMessagesRead(userId))`
   (`phase-10.md:1878-1900`). Live arrival relies on this: `router.refresh()` re-renders the page,
   which re-runs that `after`, which is what clears the unread dot when a message lands in an open
   window.
6. **Phase 4** — `components/nina/ChatScreen.tsx` seeds
   `const [messages, setMessages] = useState<ChatMessage[]>(() => [...initial])` from a
   `initial: readonly ChatMessage[]` prop and has an `alive` ref plus an existing block of
   `useEffect`s (`phase-4.md:1776-1806`). `components/nina/types.ts` exports `ChatMessage` with at
   least `{ id: string }`.

**Leaves alone (owned by others):**

- `lib/nina/proactive.ts` beyond the single default on the `NOOP_NOTIFIER` line — every trigger,
  every threshold, every marker write is phase 10's.
- `lib/nina/queries.ts`, `countUnreadNinaMessages`, `markNinaMessagesRead`,
  `components/nina/NinaUnreadBadge.tsx`, `components/ui/TabBar.tsx` — phase 10's unread story.
  This phase adds no query to `lib/nina/queries.ts`.
- `components/nina/MessageBubble.tsx`, `MessageList.tsx`, `Composer.tsx` — phases 4, 6, 7, 8.
  Phase 7 makes `MessageBubble` a `'use client'` module; **this phase does not touch that file at
  all**, so the three-way rewrite of one component head does not happen.
- `lib/pwa.ts`, `app/manifest.ts`, `app/layout.tsx`, `tests/pwa.install.test.ts` — the install
  contract is asserted and must stay green. Nothing here edits it.
- `app/api/cron/nina/route.ts` and `vercel.json` — phase 10's.
- Offline support, any caching strategy, `experimental.useOffline`, Serwist — out of scope in the
  plan index.
- `next.config.ts`'s existing four header entries and the `/s/:token` block.

---

## Files

| File | Action | What changes |
|---|---|---|
| `package.json` | modify | `web-push@3.6.7` in `dependencies` (`:73` block), `@types/web-push@3.6.4` in `devDependencies` (`:90` block) |
| `lib/env.ts` | modify | `pushSchema` gains `VAPID_SUBJECT` (phase 1's block, ~`:2162` of its plan; in the shipped file, the `pushSchema` const) |
| `.env.example` | modify | `VAPID_SUBJECT` added under phase 1's Web Push block |
| `lib/push/payload.ts` | create | payload shape, subscription parsing, the pruning rule — pure |
| `lib/push/payload.test.ts` | create | those three, at their edges |
| `lib/push/queries.ts` | create | every read and write against `push_subscriptions` |
| `lib/push/send.ts` | create | the VAPID send path over `web-push`, fan-out, prune-on-terminal |
| `lib/push/actions.ts` | create | subscribe / unsubscribe / send-test Server Actions |
| `lib/service-worker.js` | create | `push` + `notificationclick`, nothing else |
| `lib/nina/live.ts` | create | `mergeServerMessages` + the SW message type — pure |
| `lib/nina/live.test.ts` | create | the merge, including mid-reveal |
| `components/push/PushSetupCard.tsx` | create | the client control: subscribe, unsubscribe, iOS hint |
| `components/push/PushSetup.tsx` | create | the server wrapper that reads `pushEnv()` and passes the prop |
| `app/me/page.tsx` | modify | one `<Card>` with `<PushSetup />`, after the badges card (`:104`) |
| `components/nina/ChatScreen.tsx` | modify | two `useEffect`s + `useRouter()` for live arrival (`:1785` area) |
| `lib/nina/proactive.ts` | modify | `NOOP_NOTIFIER` -> `pushNotifier` as the `deps.notify` default (one line) |
| `next.config.ts` | modify | one `headers()` entry for `/_next/static/service-worker/:path*` |
| `scripts/check-client-secret-boundary.mjs` | modify | `VAPID_PRIVATE_KEY` into `SECRETS` |

Eighteen files against the index's estimate of ~8. The overage is the pure/test split invariant 6
demands (three modules, two test files), the two-component server/client split that deviation 1
forces, and five one-line edits to files other phases own.

---

## Implementation Steps

### Step 1: `web-push`, pinned

**File:** `package.json:73` (`dependencies`, alphabetical — after `server-only`, before `zod`) and
`package.json:90` (`devDependencies`, after `typescript`, before `vitest`)
**Change:** two exact pins. Every version in this file is exact — no `^`, no `~` — with one
pre-existing exception (`playwright: "^1.62.1"`). Follow the rule, not the exception.

**Code** — `dependencies`:

```json
    "server-only": "0.0.1",
    "web-push": "3.6.7",
    "zod": "4.4.3"
```

**Code** — `devDependencies`:

```json
    "typescript": "5.9.3",
    "@types/web-push": "3.6.4",
    "vitest": "4.1.2"
```

**A prerequisite that is not optional.** `NINA_CHATBOT_PLAN.md:35-50` records that this worktree's
`node_modules` is a **symlink to the main checkout**, created so the phase planners could read
`node_modules/next/dist/docs/`. Installing through it would mutate the other tree's dependencies.
Before this step:

```
rm node_modules && npm install
```

**Impact:** `web-push` pulls `https-proxy-agent`, `jws`, `minimist` and `asn1.js`. It is a
**Node-only** package: it signs JWTs and encrypts payloads with `node:crypto` and posts with
`node:https`. Every caller must therefore be on the Node runtime. That is already true everywhere
and stated in `next.config.ts:4` — *"Every route in this app runs on the Node.js runtime"* — and
both concrete entry points declare it anyway: `app/api/cron/nina/route.ts` (phase 10) and
`app/api/upload/route.ts` (`export const runtime = 'nodejs'`). Server Actions inherit the runtime
of the segment that invokes them, and `/me` is a Node page. **If a future edge segment ever appears,
`lib/push/send.ts` must not be reachable from it.**

---

### Step 2: `VAPID_SUBJECT` — phase 1's one-line handoff, taken

**File:** `lib/env.ts` — inside phase 1's `pushSchema` (the const between `cronSchema` and
`adminSchema`; in today's pre-phase-1 file the anchor is `cronSchema` at `:93-96`)
**Change:** a third key, plus a `mailto:`/`https:` shape check and the paragraph that says why it
exists at all.

Phase 1 named this explicitly (`phase-1.md:3563-3566`): *"`web-push` needs a VAPID subject
(`mailto:`) that `pushEnv()` does not carry; adding `VAPID_SUBJECT` there is one line and phase 11
should make it rather than hardcode a mailto."* This is that line.

**Code** — the replacement `pushSchema`, keeping phase 1's docstring and adding to it:

```ts
/**
 * F33 / R3 owns these. Generate a pair with:
 *
 *     npx --yes web-push generate-vapid-keys
 *
 * **The public key is read SERVER-SIDE and passed to the client component as a prop** — there is
 * no `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and there must not be one (plan invariant 10, enforced by
 * `ci:client-secret-guard`). The Next.js PWA guide's recipe uses the `NEXT_PUBLIC_` form; that
 * step is deliberately not followed here.
 *
 * ── WHY `VAPID_SUBJECT` IS A VARIABLE AND NOT A STRING LITERAL ────────────────────────────────
 * The VAPID spec (RFC 8292 §2.1) requires the signed JWT to carry a `sub` claim that is a contact
 * for the sender — a `mailto:` or an `https:` URL — so that a push service with a misbehaving
 * sender has somebody to contact instead of only an anonymous key. `web-push` will not sign
 * without it: `setVapidDetails` throws `"The subject value must be a string containing an https:
 * or mailto: URL"`. It is an address rather than a constant because the address is deployment
 * configuration in the same way `CRON_SECRET` is, and because a literal in `lib/push/send.ts`
 * would put a personal email into the repo's grep surface for the sake of saving one line here.
 *
 * The shape is validated rather than merely non-empty: an unprefixed email is the mistake this
 * variable invites, it is rejected by Apple's and Google's push services rather than by us, and
 * the symptom would be a 400 on every send with no local error at all.
 */
const pushSchema = z.object({
  VAPID_PUBLIC_KEY: nonEmpty('VAPID_PUBLIC_KEY'),
  VAPID_PRIVATE_KEY: nonEmpty('VAPID_PRIVATE_KEY'),
  VAPID_SUBJECT: nonEmpty('VAPID_SUBJECT').refine(
    (value) => value.startsWith('mailto:') || value.startsWith('https://'),
    'VAPID_SUBJECT must be a mailto: address or an https:// URL (RFC 8292 §2.1)',
  ),
})
```

**Impact:** `pushEnv()`'s return type widens by one field and `PushEnv` widens with it. Nothing
reads `pushEnv()` before this phase, so the widening breaks nothing. A deploy that sets the two
keys but not the subject fails **at the first send or the first `/me` render**, not at boot —
`pushEnv()` is lazy by phase 1's design, exactly so `/` and `/r/[id]` keep serving on a deployment
that has no VAPID configuration yet (`phase-1.md:2115`).

---

### Step 3: `.env.example`

**File:** `.env.example` — phase 1's Web Push block (its plan writes it at `:2257-2263`; it lands
after the `CRON_SECRET` block at today's `:14-15`)
**Change:** one variable and two lines of comment. The block phase 1 writes is reproduced here in
full so the append is unambiguous.

**Code:**

```
# --- Web Push (F33 R3) ------------------------------------------------------
# Generate the pair with:  npx --yes web-push generate-vapid-keys
# Both are SERVER-ONLY. There is no NEXT_PUBLIC_ form of the public key and there must not be
# one (ROADMAP §4.1); it reaches the browser as a prop from components/push/PushSetup.tsx.
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
# RFC 8292 §2.1 requires a contact for the sender in the signed JWT. mailto: or https:// only.
VAPID_SUBJECT=mailto:miftahul.mahfuzh@tuntun.co.id
```

**Impact:** `.env.example` is the checklist a Vercel environment is filled in from. Rotating the
key pair invalidates every stored subscription — a subscription is bound to the application server
key it was created with — so a rotation means every row in `push_subscriptions` starts answering
`403 Forbidden`, which `classifyPushFailure` treats as retryable (Step 5) and therefore **will not
prune**. That is deliberate and it is the right call: a wrong `VAPID_SUBJECT` or a half-rotated key
pair also produces 403, and silently deleting every subscription because of a configuration typo is
worse than a loud, retrying failure. **A key rotation is a manual
`DELETE FROM push_subscriptions;` plus a re-subscribe on each device.** Written here because the
symptom is otherwise inexplicable.

---

### Step 4: teach the client-secret guard about the private key

**File:** `scripts/check-client-secret-boundary.mjs:38-48` (the `SECRETS` array)
**Change:** one entry.

**Code:**

```js
const SECRETS = [
  'LLM_API_KEY',
  'AUTH_SECRET',
  'AUTH_GOOGLE_SECRET',
  'AUTH_GOOGLE_ID',
  'BLOB_READ_WRITE_TOKEN',
  'CRON_SECRET',
  'DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'OPENROUTER_API_KEY',
  /*
   * F33 R3. The signing half of the VAPID pair: whoever holds it can send push notifications to
   * every subscription this app has ever stored, as this app. `VAPID_PUBLIC_KEY` is deliberately
   * NOT in this list — it is public by construction (it travels in every `pushManager.subscribe`
   * call) and listing it would make RULE 1 forbid the one server component whose entire job is to
   * read it and hand it to the browser as a prop.
   */
  'VAPID_PRIVATE_KEY',
]
```

**Impact:** RULE 1 now fails if any `'use client'` module names `VAPID_PRIVATE_KEY`; RULE 2 fails on
a raw `process.env.VAPID_PRIVATE_KEY` outside `lib/env.ts`. Both are the failures this phase most
plausibly introduces by accident, since the guide's `app/actions.ts` reads exactly that raw. RULE 3
is untouched and is what makes deviation 1 non-negotiable. Run `npm run ci:client-secret-guard`
after every step in this phase, not only at the end.

---

### Step 5: `lib/push/payload.ts` — the pure core

**File:** `lib/push/payload.ts` (new)
**Change:** the whole file. Three things live here and nothing else does: **what a push payload
is**, **how a browser-supplied subscription becomes three columns**, and **when a failing
subscription is dead rather than unlucky**. All three are pure functions over plain data, which is
the whole point — invariant 6 says vitest runs `environment: 'node'` with no jsdom, so the testable
surface of this phase is exactly the part with no `self`, no `navigator` and no database in it.

**No `server-only`.** This module is imported by the service worker's *counterpart* logic, by the
Server Actions, by the sender and by its own test. `server-only` would be a lie in a file with no
secrets and no I/O, and the vitest alias that neutralises it exists for modules that genuinely
need it.

**Code:**

```ts
import { z } from 'zod'

/**
 * Everything that crosses the Web Push boundary, and nothing that touches a browser API or a
 * database. This file is the reason phase 11 is testable at all: `vitest` runs
 * `environment: 'node'` with no jsdom (plan invariant 6), so `self`, `navigator` and
 * `PushSubscription` are all unavailable in a test. What IS testable is the shape of the message,
 * the parse of the subscription, and the decision to give up on an endpoint — and those are the
 * three things in this phase that can be wrong in a way nobody notices for a week.
 */

/** The notification's title. Not the message body — see `buildNinaPushPayload`. */
export const PUSH_TITLE = 'Nina'

/** Where a tap lands. Also the URL the service worker looks for among open windows to focus. */
export const PUSH_TARGET_URL = '/nina'

/**
 * One tag for every Nina notification, so a second one REPLACES the first in the tray instead of
 * stacking. Nina sends 1–4 bubbles per turn (RU-5) and four separate notifications for one thought
 * is the behaviour that makes people turn notifications off. `renotify` is set alongside it in the
 * worker so a replacement still buzzes rather than landing silently.
 */
export const PUSH_NOTIFICATION_TAG = 'nina'

/**
 * A notification body is truncated by the OS anyway — iOS shows roughly four lines on a locked
 * XS Max — and the encrypted payload has a hard ceiling around 4 KB that a long bubble plus a UTF-8
 * Indonesian sentence can approach. Truncating HERE rather than letting the platform do it means
 * the cut lands on a word boundary with an ellipsis instead of mid-syllable.
 */
export const PUSH_BODY_MAX_CHARS = 180

/**
 * Consecutive failures before a subscription is revoked even though no single failure was
 * terminal. Five is a number, not a discovery: a real outage at Apple or Google is measured in
 * minutes and Nina speaks a handful of times a day, so five straight failures spans days and is
 * evidence about the subscription rather than about the weather.
 */
export const PUSH_FAILURE_LIMIT = 5

/**
 * **The pruning rule, and the whole of it.** RFC 8030 §7.3: a push service answers `404 Not Found`
 * for an endpoint it has never heard of and `410 Gone` for one that has been deleted — a browser
 * that cleared its site data, an app that was deleted from the home screen, a subscription the
 * user revoked in Settings. Both are permanent by specification and neither will ever succeed
 * again.
 *
 * **Everything else is retryable, and the omissions are deliberate:**
 *   - `429 Too Many Requests` — rate limiting. The subscription is alive; we were noisy.
 *   - `5xx` — the push service is having a day.
 *   - `401` / `403` — a VAPID problem, which is OUR configuration and not their subscription.
 *     A rotated key pair, a bad `VAPID_SUBJECT` or a mismatched public key all land here, and
 *     pruning on 403 would delete every subscription in the table because of a typo in an
 *     environment variable. See Step 3.
 *   - `400` — a malformed request, which is a bug in this code. Retrying is wrong but so is
 *     deleting the user's subscription to hide it; the failure count will surface it.
 *   - no status code at all (DNS, socket, timeout) — the network, not the endpoint.
 */
export const TERMINAL_PUSH_STATUS_CODES = [404, 410] as const

/** What a failed send tells us about the subscription itself. */
export type PushFailureVerdict = 'gone' | 'retry'

export function classifyPushFailure(statusCode: number | null | undefined): PushFailureVerdict {
  if (typeof statusCode !== 'number') return 'retry'
  return (TERMINAL_PUSH_STATUS_CODES as readonly number[]).includes(statusCode) ? 'gone' : 'retry'
}

/**
 * The second half of the pruning rule: a subscription that has never worked and keeps not working
 * is also gone, it just never said so. `failureCount` is the count BEFORE this failure, so the
 * comparison is against the incremented value.
 *
 * `lastSuccessAt` is not consulted on purpose. A subscription that succeeded once and has failed
 * five times since is exactly as dead as one that never succeeded, and adding "but it worked in
 * March" to the condition only keeps corpses in the table.
 */
export function shouldRevokeSubscription(input: {
  verdict: PushFailureVerdict
  failureCount: number
}): boolean {
  return input.verdict === 'gone' || input.failureCount + 1 >= PUSH_FAILURE_LIMIT
}

/**
 * A subscription as the browser hands it over. `PushSubscription.toJSON()` produces
 * `{ endpoint, expirationTime, keys: { p256dh, auth } }`; `expirationTime` is ignored because no
 * shipping browser sets it to anything but `null` and a column for it would be a column of nulls.
 *
 * **This is parsed rather than trusted** even though the only caller is our own client component,
 * for the ordinary Server Action reason: the argument arrives over the wire from a browser and a
 * Server Action is a public HTTP endpoint. Writing an attacker-supplied string into `endpoint`
 * would turn `webpush.sendNotification` into a request-forgery primitive, which is why the scheme
 * check below is `https:` and not a regex over the whole URL.
 */
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .min(1, 'endpoint is required')
    .max(2048, 'endpoint is implausibly long')
    .refine((value) => {
      try {
        return new URL(value).protocol === 'https:'
      } catch {
        return false
      }
    }, 'endpoint must be an https:// URL'),
  keys: z.object({
    p256dh: z.string().min(1, 'keys.p256dh is required'),
    auth: z.string().min(1, 'keys.auth is required'),
  }),
})

/** The three columns a subscription becomes. Flat, because `push_subscriptions` is flat. */
export interface PushSubscriptionInput {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * `unknown` in, a flat row or `null` out. No throw: the caller is a Server Action whose honest
 * answer to a malformed subscription is `{ ok: false }`, not a 500 in the browser console.
 */
export function parsePushSubscription(value: unknown): PushSubscriptionInput | null {
  const parsed = pushSubscriptionSchema.safeParse(value)
  if (!parsed.success) return null
  return {
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
  }
}

/**
 * ── THE PAYLOAD CONTRACT WITH `lib/service-worker.js` ─────────────────────────────────────────
 * This type and that file are two halves of one wire format, and the service worker is the half
 * that cannot be type-checked (it is plain JS, it runs in a worker global, and it may be a version
 * older than the server that is pushing to it — a registered worker survives a deploy).
 *
 * Hence `v`. A worker from last week receiving a `v: 2` payload it does not understand must still
 * show *something*, so the worker reads `title` and `body` defensively and ignores fields it does
 * not know. **If a field's meaning ever changes rather than being added, bump `v` and branch in
 * the worker** — do not silently repurpose a name.
 */
export interface NinaPushPayload {
  /** Wire version. Bump only on an incompatible change, never on an addition. */
  v: 1
  title: string
  body: string
  /** Where a tap goes. Always same-origin and always a path, never an absolute URL. */
  url: string
  tag: string
  /** The `nina_messages.id` of the first bubble, or null. Diagnostics only; nothing reads it yet. */
  messageId: string | null
  /** Phase 10's `ProactiveTriggerKind`, as an opaque string. Diagnostics only. */
  kind: string
}

/**
 * Cut to a word boundary and add an ellipsis. A body that already fits comes back untouched and
 * un-ellipsised, which is the case that matters — Nina's bubbles are short by design (RU-5).
 */
export function truncateForNotification(
  body: string,
  max: number = PUSH_BODY_MAX_CHARS,
): string {
  const trimmed = body.trim()
  if (trimmed.length <= max) return trimmed
  const hard = trimmed.slice(0, max)
  const lastSpace = hard.lastIndexOf(' ')
  /* Only respect a word boundary if it is not absurdly early — a 180-character CJK or hashtag
   * blob has no spaces, and cutting at char 3 to honour the one space in it is worse than cutting
   * mid-word. */
  const cut = lastSpace > max * 0.6 ? hard.slice(0, lastSpace) : hard
  return `${cut.trimEnd()}…`
}

/**
 * **Phase 10 hands over `bubbles` in reveal order**, so `bubbles[0]` is the first thing she says
 * and it is the notification body — exactly as phase 10's handoff specifies
 * (`phase-10.md:2013-2017`). The remaining bubbles are deliberately NOT concatenated: the
 * notification is a knock on the door, not the conversation, and a four-bubble wall of text in a
 * lock screen destroys the staggered reveal that RU-5 chose on purpose.
 *
 * The title is her name and never the message, because a notification whose title is the message
 * and whose body is empty renders differently on every platform.
 */
export function buildNinaPushPayload(input: {
  messages: ReadonlyArray<{ id: string; body: string }>
  kind: string
}): NinaPushPayload | null {
  const first = input.messages.find((message) => message.body.trim().length > 0)
  if (!first) return null
  return {
    v: 1,
    title: PUSH_TITLE,
    body: truncateForNotification(first.body),
    url: PUSH_TARGET_URL,
    tag: PUSH_NOTIFICATION_TAG,
    messageId: first.id,
    kind: input.kind,
  }
}

export function encodeNinaPushPayload(payload: NinaPushPayload): string {
  return JSON.stringify(payload)
}

/**
 * The inverse, for the test and for anybody debugging a payload out of a log line. The service
 * worker does NOT use this — it cannot import from `lib/` in a way that survives being a separate
 * bundle entry, and duplicating six lines of defensive reads there is cheaper than a shared
 * module that has to be safe in three runtimes.
 */
export function decodeNinaPushPayload(raw: string): NinaPushPayload | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return null
    const candidate = parsed as Partial<NinaPushPayload>
    if (typeof candidate.title !== 'string' || typeof candidate.body !== 'string') return null
    return {
      v: 1,
      title: candidate.title,
      body: candidate.body,
      url: typeof candidate.url === 'string' ? candidate.url : PUSH_TARGET_URL,
      tag: typeof candidate.tag === 'string' ? candidate.tag : PUSH_NOTIFICATION_TAG,
      messageId: typeof candidate.messageId === 'string' ? candidate.messageId : null,
      kind: typeof candidate.kind === 'string' ? candidate.kind : 'unknown',
    }
  } catch {
    return null
  }
}
```

**Impact:** a new leaf module with one dependency (`zod`, already a dependency). Nothing imports it
yet. `buildNinaPushPayload` returning `null` for an all-blank turn is the case that keeps the
sender from posting an empty notification — phase 10 already refuses to emit an empty turn, so this
is belt to that brace.

---

### Step 6: `lib/push/queries.ts` — every read and write of `push_subscriptions`

**File:** `lib/push/queries.ts` (new)
**Change:** the whole file. Phase 1 declared the table and deliberately gave it **zero** query
functions (`phase-1.md:2102`); these are they.

**Why here and not in `lib/db/queries.ts`.** Two reasons, and the first is mechanical:
`scripts/check-data-layer-invariants.mjs` parses `lib/db/queries.ts` and fails on any exported
function whose first parameter is not `userId`, against a hand-maintained allow-list. Every
function below **does** take `userId` first — invariant 7, and it is the ownership check — so the
guard would pass either way. The real reason is the second: phase 1 put Nina's reads in
`lib/nina/queries.ts` rather than in the shared module, and push is a third bounded context with
its own vocabulary (endpoints, VAPID, revocation). `lib/db/queries.ts` is 1500 lines of run and
badge and record vocabulary and this does not belong in it.

**Every function takes `userId` first and scopes on it, including the ones keyed by a globally
unique endpoint.** `endpoint` is unique by RFC 8030, so `WHERE endpoint = $1` alone would be
correct — and it is still wrong to write, because it is an unscoped write against a shared table
and the next such function will not have the uniqueness argument going for it. The `AND user_id`
costs nothing and removes the need to reason about it.

**Code:**

```ts
import 'server-only'
import { and, count, eq, isNull, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { pushSubscriptions } from '@/lib/db/schema'
import { newId } from '@/lib/id'
import type { PushFailureVerdict, PushSubscriptionInput } from './payload'
import { shouldRevokeSubscription } from './payload'

/**
 * The whole of `push_subscriptions`' read/write surface. Phase 1 shipped the table with no
 * functions on purpose so that this phase — the only thing in the app with an opinion about
 * VAPID — owns them all.
 *
 * ── SOFT DELETE FOR A DEAD ENDPOINT, HARD DELETE FOR A HUMAN DECISION ─────────────────────────
 * Two different events are deliberately recorded two different ways.
 *
 * A push service answering 410 means the browser threw the subscription away, and the row is set
 * `revoked_at` rather than deleted. It stays because "which browser stopped answering, and when"
 * is the only forensic trail this feature has when the answer to "why did my phone stop buzzing"
 * is "you reinstalled the PWA in June" — and because the row is one short URL, on a single-user
 * app, forever.
 *
 * A runner tapping "Turn off notifications" is a decision, and it DELETES. Keeping a tombstone of
 * a choice the user made explicitly would mean "off" is a state the database still holds an
 * endpoint for, and there is no forensic question that justifies it.
 *
 * The revoked rows are why `savePushSubscription` must clear `revoked_at`: a browser can hand back
 * an endpoint it previously abandoned, the unique index would collide, and a re-subscribe that
 * silently no-ops is the worst available bug here — the button says "on", the phone stays quiet.
 */

/** A subscription worth sending to: this user's, not revoked. */
export interface LivePushSubscription {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  failureCount: number
}

/**
 * Upsert on `endpoint` (the `push_subscriptions_endpoint_unq` index phase 1 declared).
 *
 * `set` re-homes `user_id` on conflict. That is not paranoia: two Google accounts on one browser
 * profile produce ONE endpoint, and whoever subscribed last is who that browser belongs to. The
 * alternative — leaving the old owner — would send this runner's messages to a row read under
 * another user's id, which is the one bug in this codebase with no recoverable failure mode.
 *
 * The failure counters reset to zero and `revoked_at` clears, because a fresh
 * `pushManager.subscribe()` is a fresh subscription even when the endpoint string matches.
 */
export async function savePushSubscription(
  userId: string,
  input: PushSubscriptionInput & { userAgent?: string | null },
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      id: newId(),
      userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
      failureCount: 0,
      revokedAt: null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
        failureCount: 0,
        lastFailureAt: null,
        revokedAt: null,
      },
    })
}

/**
 * The send fan-out. Runs through `push_subscriptions_user_idx`.
 *
 * Ordinarily one row. It is a list rather than a single row because the same account on a phone
 * and on a laptop is two subscriptions, and a design that stores one would make installing the PWA
 * on the phone silently unsubscribe the laptop.
 */
export async function listLivePushSubscriptions(userId: string): Promise<LivePushSubscription[]> {
  return db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      failureCount: pushSubscriptions.failureCount,
    })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), isNull(pushSubscriptions.revokedAt)))
}

/** What `PushSetup` renders from: is this account subscribed anywhere at all. */
export async function countLivePushSubscriptions(userId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), isNull(pushSubscriptions.revokedAt)))
  return Number(rows[0]?.n ?? 0)
}

/**
 * "Turn off notifications". A hard delete — see the header.
 *
 * Unconditional on purpose: a DELETE that matches nothing is cheaper than the SELECT that would
 * tell us it would, and the browser has already called `subscription.unsubscribe()` by the time
 * this runs, so a row that is not here is the correct end state either way.
 */
export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)),
    )
}

/** A send landed. Clears the failure streak — the streak is about *consecutive* failures. */
export async function recordPushSuccess(
  userId: string,
  id: string,
  at: Date = new Date(),
): Promise<void> {
  await db
    .update(pushSubscriptions)
    .set({ lastSuccessAt: at, failureCount: 0, lastFailureAt: null })
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.id, id)))
}

/**
 * A send failed. **This is the pruning, and it is one statement.**
 *
 * `failure_count` increments in SQL (`failure_count + 1`) rather than from a value read in
 * TypeScript, so two concurrent sends cannot both write "1". `shouldRevokeSubscription` is
 * evaluated against the count the caller already has in hand, which can be one behind under a
 * race — and the consequence of being one behind is that revocation happens on the sixth failure
 * instead of the fifth. That is an acceptable amount of wrong for a personal app, and saying so
 * here is cheaper than a transaction.
 *
 * A `'gone'` verdict revokes immediately regardless of the count: 404 and 410 are permanent by
 * specification and there is nothing to be gained by trying four more times.
 */
export async function recordPushFailure(
  userId: string,
  id: string,
  verdict: PushFailureVerdict,
  failureCount: number,
  at: Date = new Date(),
): Promise<void> {
  const revoke = shouldRevokeSubscription({ verdict, failureCount })
  await db
    .update(pushSubscriptions)
    .set({
      lastFailureAt: at,
      failureCount: sql`${pushSubscriptions.failureCount} + 1`,
      ...(revoke ? { revokedAt: at } : {}),
    })
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.id, id)))
}
```

**Impact:** the table stops being inert. `newId()` from `lib/id.ts` supplies the nanoid(12) primary
key phase 1's schema comment specifies. No migration: phase 1's migration already created the
table and both indexes.

**One signature note for the reconciler:** `recordPushFailure` takes `failureCount` as a fourth
parameter rather than re-reading the row, because the sender already holds it from
`listLivePushSubscriptions`. If a future caller does not, it must SELECT first — do not add a
default of `0`, which would silently disable the consecutive-failure ceiling.

---

### Step 7: `lib/push/send.ts` — the VAPID send path

**File:** `lib/push/send.ts` (new)
**Change:** the whole file. This is the module phase 10's seam calls.

**Code:**

```ts
import 'server-only'
import webpush, { WebPushError } from 'web-push'

import { pushEnv } from '@/lib/env'
import type { ProactiveNotifier } from '@/lib/nina/proactive'
import {
  buildNinaPushPayload,
  classifyPushFailure,
  encodeNinaPushPayload,
  type NinaPushPayload,
} from './payload'
import {
  listLivePushSubscriptions,
  recordPushFailure,
  recordPushSuccess,
  type LivePushSubscription,
} from './queries'

/**
 * The one place this app talks to a push service.
 *
 * ── NODE RUNTIME, NOT EDGE ────────────────────────────────────────────────────────────────────
 * `web-push` signs a VAPID JWT with `node:crypto`, encrypts the payload with ECDH + HKDF + AES-GCM
 * (RFC 8291) and posts with `node:https`. None of that exists on the edge runtime. Every route
 * that can reach this module must be `runtime = 'nodejs'`; `next.config.ts:4` records that every
 * route in this app already is, and phase 10's `app/api/cron/nina/route.ts` declares it explicitly.
 *
 * ── WHY THE `ProactiveNotifier` IMPORT IS TYPE-ONLY ───────────────────────────────────────────
 * `lib/nina/proactive.ts` imports `pushNotifier` from this file, and this file needs that file's
 * type. `import type` is erased by the compiler, so the cycle exists only in the type graph and
 * never at runtime. **Do not turn it into a value import** to "tidy" it — that is a real
 * require-cycle between two modules that both do work at import time.
 */

/**
 * How long a push service should hold an undelivered notification. Three hours, deliberately
 * short: Nina's messages are about right now — "you usually run on Tuesdays and it is 8pm" — and
 * one that surfaces the following afternoon is not late, it is wrong. The message itself is never
 * lost; it is a row in `nina_messages` and the unread dot is still on the tab.
 */
const PUSH_TTL_SECONDS = 3 * 60 * 60

/** `setVapidDetails` mutates module state, so it runs once and is memoised, not per send. */
let vapidConfigured = false
function configureVapid(): void {
  if (vapidConfigured) return
  const env = pushEnv()
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
  vapidConfigured = true
}

export interface PushSendReport {
  attempted: number
  delivered: number
  /** Subscriptions revoked by this send — terminal status, or the consecutive-failure ceiling. */
  pruned: number
  /** Failed but kept. */
  retryable: number
  /** Set when nothing was even attempted, so a log line explains itself. */
  skipped: string | null
}

const NOTHING = (reason: string): PushSendReport => ({
  attempted: 0,
  delivered: 0,
  pruned: 0,
  retryable: 0,
  skipped: reason,
})

/**
 * One subscription, one attempt. Returns the verdict rather than throwing, because the fan-out's
 * job is to keep going.
 */
export async function sendPushToSubscription(
  userId: string,
  subscription: LivePushSubscription,
  payload: NinaPushPayload,
): Promise<'delivered' | 'pruned' | 'retryable'> {
  configureVapid()
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      encodeNinaPushPayload(payload),
      { TTL: PUSH_TTL_SECONDS, urgency: 'normal', topic: payload.tag },
    )
    await recordPushSuccess(userId, subscription.id)
    return 'delivered'
  } catch (cause) {
    /* `WebPushError` carries `statusCode`, `body` and `endpoint`. Anything else is a network or a
     * programming error and has no status code, which `classifyPushFailure` reads as retryable. */
    const statusCode = cause instanceof WebPushError ? cause.statusCode : null
    const verdict = classifyPushFailure(statusCode)
    await recordPushFailure(userId, subscription.id, verdict, subscription.failureCount)

    /* Logged, never rethrown. The endpoint is truncated because it is 300 characters of which the
     * host is the only informative part. */
    console.warn('[push] send failed', {
      userId,
      subscriptionId: subscription.id,
      host: hostOf(subscription.endpoint),
      statusCode,
      verdict,
      failureCount: subscription.failureCount,
    })

    if (verdict === 'gone' || subscription.failureCount + 1 >= PUSH_FAILURE_CEILING_HINT) {
      return 'pruned'
    }
    return 'retryable'
  }
}

/**
 * `PUSH_FAILURE_LIMIT` lives in `payload.ts` and is imported there by `shouldRevokeSubscription`,
 * which is the function that actually decides. This local alias exists only so the report's
 * `pruned` count agrees with what the database did, and it is written as a separate name so nobody
 * reads it as a second, competing threshold.
 */
import { PUSH_FAILURE_LIMIT as PUSH_FAILURE_CEILING_HINT } from './payload'

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return 'unparseable'
  }
}

/**
 * **The function phase 10's seam calls.** Fan out one proactive turn to every live subscription
 * this user has.
 *
 * ── SEQUENTIAL, AND ONE SUBSCRIPTION'S FAILURE STOPS NOTHING ──────────────────────────────────
 * The same shape as `app/api/cron/rollup/route.ts`'s per-user loop and for the same reason: two
 * subscriptions is the realistic maximum, `Promise.all` would buy nothing measurable, and a
 * rejected promise in an `all` would abandon the remaining sends *and* their database updates.
 *
 * ── IT NEVER THROWS ───────────────────────────────────────────────────────────────────────────
 * A missing VAPID configuration is the one thing that could throw here, from `pushEnv()`, and it
 * throws before the loop. It is caught and reported as `skipped` rather than propagated, because
 * phase 10 calls this AFTER committing the message rows and a thrown notifier must never make a
 * successful turn look like a failed one. Phase 10 wraps the call in its own `try` as well
 * (`phase-10.md:1065-1068`); this is the belt to that brace, and it is what makes a deployment
 * with no VAPID keys behave as "no notifications" instead of "a warning per turn".
 */
export async function sendNinaPush(
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: string,
): Promise<PushSendReport> {
  const payload = buildNinaPushPayload({ messages, kind })
  if (!payload) return NOTHING('no message body to send')

  try {
    configureVapid()
  } catch (cause) {
    return NOTHING(`VAPID not configured: ${String(cause)}`)
  }

  const subscriptions = await listLivePushSubscriptions(userId)
  if (subscriptions.length === 0) return NOTHING('no live subscriptions')

  const report: PushSendReport = {
    attempted: 0,
    delivered: 0,
    pruned: 0,
    retryable: 0,
    skipped: null,
  }

  for (const subscription of subscriptions) {
    report.attempted += 1
    try {
      const outcome = await sendPushToSubscription(userId, subscription, payload)
      report[outcome] += 1
    } catch (cause) {
      /* `sendPushToSubscription` already swallows the send error; reaching here means the DATABASE
       * update failed. Count it as retryable and keep going — the notification may well have been
       * delivered, and the counter being wrong is not worth losing the next subscription over. */
      report.retryable += 1
      console.warn('[push] bookkeeping failed', {
        userId,
        subscriptionId: subscription.id,
        error: String(cause),
      })
    }
  }

  return report
}

/**
 * Phase 10's `ProactiveDeps.notify` default. `satisfies` rather than an annotation so a change to
 * `ProactiveNotifier`'s shape is a compile error here, at the seam, rather than at the assignment
 * in `proactive.ts`.
 *
 * The report is discarded on purpose: phase 10's notifier returns `Promise<void>` because a
 * proactive turn's success has nothing to do with whether a phone was reachable. The numbers are
 * in the log line below, which is the only consumer they have.
 */
export const pushNotifier = (async (userId, messages, kind) => {
  const report = await sendNinaPush(userId, messages, kind)
  console.info('[push] notified', { userId, kind, ...report })
}) satisfies ProactiveNotifier
```

**One tidy-up for the implementer:** the `import { PUSH_FAILURE_LIMIT as … }` line above sits
mid-file so its comment reads in place. Move it up with the other imports when writing the file —
`eslint`'s `import/first` will insist — and keep the comment with it.

**Impact:** the first module in the repo that makes an outbound request to a host other than
`api.z.ai`, Neon, Vercel Blob and OpenRouter. No allow-listing is needed: push endpoints are
`fcm.googleapis.com`, `web.push.apple.com`, `updates.push.services.mozilla.com` and whatever else
a browser vendor chooses, so an allow-list would be a list of things to break. `next.config.ts`'s
`images.remotePatterns` is unaffected — nothing renders an image from a push service.

---

### Step 8: `lib/service-worker.js` — the app's first service worker

**File:** `lib/service-worker.js` (new)
**Change:** the whole file. **Verified absent before this phase:**
`grep -rn "serviceWorker" app lib components public` returns nothing, so there is no existing
worker, no registration, and no `public/sw.js` to reconcile with.

**Two listeners and nothing else.** No `install`, no `activate`, no `fetch`, no cache, no
precache, no Serwist. That is not minimalism for its own sake: the plan index puts offline support
and caching out of scope (`NINA_CHATBOT_PLAN.md:182-184`) because **a caching worker changes how
every page in the app loads**, and a notification feature does not get to make that decision in
passing. A `fetch` handler added here would silently become the app's page-load path.

**`.js` and not `.ts`.** The guide's filename, and deliberate: this file runs in a
`ServiceWorkerGlobalScope`, where `self` is not a `Window` and the DOM lib types are wrong rather
than merely absent. Typing it properly means `lib/dom.iterable` plus `WebWorker` lib in a second
`tsconfig`, which is a build-configuration change for a 60-line file. `tsconfig.json`'s `include`
lists `**/*.ts`, `**/*.tsx` and `**/*.mts` and no `.js` pattern, so this file is outside
`npm run typecheck` entirely — `allowJs: true` is set, but it only bites on a `.js` file something
imports, and nothing imports this one (it is referenced as a `new URL(…)` asset, not as a module). **The payload contract with `lib/push/payload.ts` is therefore unchecked by the
compiler** — which is why `NinaPushPayload` carries `v` and why every read below is defensive.

**Code:**

```js
/**
 * The app's first and only service worker. Two events: a push arrives, and a notification is
 * tapped. **Nothing else belongs in this file.**
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
 * of this file against THIS week's payloads. Hence the version field and the defensive reads: an
 * unknown field is ignored, a missing title falls back, and a payload that will not parse still
 * produces a notification rather than a silent drop. **If a payload field's meaning changes rather
 * than being added, bump `v` in `lib/push/payload.ts` and branch on it here.**
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
       * Live arrival (phase 10's handoff, `phase-10.md:2018-2024`). Tell every open window that
       * something new exists; `ChatScreen` turns this into a `router.refresh()`. Deliberately a
       * bare signal and not the message itself — the page re-reads from the database, so there is
       * one source of truth for what is on screen and no way for a push payload to inject a bubble.
       */
      notifyOpenWindows(),
    ]),
  )
})

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
           * Same-origin by construction (a worker only sees its own origin's clients), so a
           * pathname comparison is the whole check. An open window ANYWHERE in the app is focused
           * and navigated — being on `/trends` when Nina writes should take you to her, not open a
           * duplicate app beside the one you have.
           */
          const url = new URL(client.url);
          if (url.pathname === target) return client.focus()
          if ('navigate' in client) return client.navigate(target).then(function (navigated) {
            return navigated ? navigated.focus() : client.focus()
          })
        }
        return self.clients.openWindow(target)
      }),
  )
})
```

**Impact:** the app gains a persistent background script on every device that subscribes. Two
consequences worth stating before shipping:

1. **`prettier` and `eslint` will both want this file.** `npm run format` will reformat it (the
   semicolon on the `new URL(client.url);` line above is the kind of thing it fixes) and `eslint`
   will flag `self` as undefined unless the file gets an env comment. Add
   `/* eslint-env serviceworker */` at the top if `npm run lint` complains; do **not** add an
   eslint override block to the flat config for one file.
2. **Backing this phase out is not just deleting the file** — see Rollback.

---

### Step 9: `lib/push/actions.ts` — subscribe, unsubscribe, test

**File:** `lib/push/actions.ts` (new)
**Change:** the whole file. Three Server Actions, each opening with `requireUserId()`.

The guide's `app/actions.ts` keeps the subscription in a module-level `let` and admits *"in a
production environment, you would want to store the subscription in a database"*. That is exactly
what phase 1's table is for, and it is why the exit criterion is *"persists across a restart"*: a
module-level variable on Vercel dies with the lambda, and the symptom is notifications that work
for ten minutes after you subscribe and then never again.

**Code:**

```ts
'use server'

import { revalidatePath } from 'next/cache'

import { requireUserId } from '@/lib/auth/requireUserId'
import { parsePushSubscription } from './payload'
import { sendNinaPush } from './send'
import { deletePushSubscription, savePushSubscription } from './queries'

/**
 * The three writes a runner can cause. Each opens with `requireUserId()` — invariant 7, and the
 * reason every function in `./queries` takes a userId it can trust.
 *
 * ── WHY THEY RETURN A RESULT INSTEAD OF THROWING ──────────────────────────────────────────────
 * `PushSetupCard` has a real failure state to render: permission denied, an unsupported browser, a
 * malformed subscription. A thrown Server Action gives the client an opaque digest and a console
 * error, which is the wrong shape for "your browser said no". Same reasoning as phase 3's
 * `sendNinaMessage` returning `{ ok, unavailable }` rather than throwing.
 */
export interface PushActionResult {
  ok: boolean
  /** Copy the card renders verbatim. Never a stack trace, never a status code. */
  message: string | null
}

const OK: PushActionResult = { ok: true, message: null }

/**
 * Store what `pushManager.subscribe()` produced.
 *
 * `subscription` is `unknown` and parsed, not typed as `PushSubscriptionJSON`: a Server Action is a
 * public HTTP endpoint, its argument arrives as JSON over the wire, and a TypeScript annotation on
 * it is a comment. `parsePushSubscription` is where the `https:` scheme check lives.
 */
export async function subscribeToPushAction(input: {
  subscription: unknown
  userAgent?: string | null
}): Promise<PushActionResult> {
  const userId = await requireUserId()

  const parsed = parsePushSubscription(input.subscription)
  if (!parsed) {
    return { ok: false, message: 'That subscription did not look right. Try again.' }
  }

  await savePushSubscription(userId, { ...parsed, userAgent: input.userAgent ?? null })

  /* `/me` renders the subscribed/unsubscribed state from `countLivePushSubscriptions`, so the
   * server copy has to be re-read or the card would disagree with the database on the next
   * navigation. */
  revalidatePath('/me')
  return OK
}

/**
 * "Turn off notifications". The browser has already called `subscription.unsubscribe()` by the
 * time this runs — the client does that first, because the endpoint has to be read off the live
 * subscription before it is thrown away, and because a browser-side failure must not leave the
 * database claiming the phone is subscribed when it is not.
 */
export async function unsubscribeFromPushAction(input: {
  endpoint: string
}): Promise<PushActionResult> {
  const userId = await requireUserId()
  if (typeof input.endpoint !== 'string' || input.endpoint.length === 0) {
    return { ok: false, message: 'Nothing to turn off.' }
  }
  await deletePushSubscription(userId, input.endpoint)
  revalidatePath('/me')
  return OK
}

/**
 * The "Send me a test" button, and the only reason it exists: **the round trip cannot be verified
 * any other way.** Everything else in this phase is either a unit test or a wait for a cron job.
 * A test button turns "did the whole chain work" — VAPID signing, the push service, the worker's
 * `push` handler, the notification, the tap, the focus — into one tap and one buzz, on the actual
 * phone, in about two seconds.
 *
 * It sends through `sendNinaPush` rather than a special path, so what it proves is the real thing
 * and not a parallel implementation of it. The fake message id is `'test'` and the kind is
 * `'manual_test'`; nothing reads either, and phase 10's `ProactiveTriggerKind` is deliberately not
 * imported here because this is not a trigger.
 */
export async function sendTestPushAction(): Promise<PushActionResult> {
  const userId = await requireUserId()
  const report = await sendNinaPush(
    userId,
    [{ id: 'test', body: 'Test. If you can read this, I can reach you.' }],
    'manual_test',
  )

  if (report.skipped) return { ok: false, message: `Nothing sent — ${report.skipped}.` }
  if (report.delivered === 0) {
    return {
      ok: false,
      message: 'The push service refused it. Turn notifications off and on again.',
    }
  }
  return OK
}
```

**Impact:** three new Server Actions. `revalidatePath('/me')` is the same pattern
`lib/profile/actions.ts` uses after `upsertProfile`. **`lib/push/actions.ts` must be added to
`scripts/check-llm-payload-boundary.mjs`'s `SANCTIONED` set only if that guard's rule 2 names a
symbol this file calls — it does not** (nothing here reaches a model), so that guard needs no edit.

---

### Step 10: `components/push/PushSetupCard.tsx` — the client control

**File:** `components/push/PushSetupCard.tsx` (new)
**Change:** the whole file. This is the guide's `PushNotificationManager` and `InstallPrompt`
merged into one component, because on iOS they are not two decisions — the install *is* the
prerequisite, and showing a dead "Subscribe" button above an install hint is the worst of both.

**Code:**

```tsx
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
 * is public by construction. What the prop buys is that the guard stays absolute instead of
 * growing its first exception, and that nobody reading this codebase later concludes the rule is
 * negotiable.
 *
 * **Do not "fix" this back to the documented version.** `npm run ci:client-secret-guard` will
 * fail, and it will be right.
 */

/**
 * The VAPID public key is base64url; `PushManager.subscribe` wants bytes.
 *
 * This differs from the guide's version in one way that matters under this repo's TypeScript
 * (5.9, `strict`): the array is built over an explicitly allocated `ArrayBuffer` so the return
 * type is `Uint8Array<ArrayBuffer>` and satisfies `BufferSource`. The guide's
 * `new Uint8Array(length)` infers `Uint8Array<ArrayBufferLike>`, which TS 5.9's generic typed
 * arrays will not accept there.
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
 *   `probing`      — the effect has not run yet. Renders as the subscribed/unsubscribed state the
 *                    server already knew, so there is no flash of "unsupported".
 *   `ready`        — `serviceWorker` and `PushManager` both exist. Subscribe works.
 *   `needs-install`— iOS, in a browser tab. Push is IMPOSSIBLE here; the install hint is the whole
 *                    of what this component can usefully say.
 *   `denied`       — the runner said no to the permission prompt. A button cannot re-ask; only
 *                    Settings can.
 *   `unsupported`  — everything else.
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
           * A BUNDLED module, not `/sw.js`. Next compiles this into
           * `.next/static/service-worker/` and serves it with `Service-Worker-Allowed: /`, which is
           * what makes `scope: '/'` legal from a `/_next/…` URL.
           * `updateViaCache: 'none'` stops the browser's HTTP cache from serving a stale worker
           * script on the update check — belt to the `no-store` header in `next.config.ts`.
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
      <div>
        <p className="text-[13px] font-medium text-ink-2">
          On an iPhone, Nina can only reach you once {INSTALL.shortName} is on your home screen —
          Safari does not deliver notifications to a browser tab. Tap the share button, then
          <span className="font-semibold"> Add to Home Screen</span>, then open the app from the
          icon and come back here.
        </p>
      </div>
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
        This browser cannot do push notifications. Nina still writes — the dot on her tab is how
        you will know.
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

      {notice !== null && (
        <p className="mt-3 text-[12px] font-medium text-ink-3">{notice}</p>
      )}
    </div>
  )
}
```

**Impact:** one client component. **Check `Button`'s prop names against
`components/ui/Button.tsx:30` before writing** — `variant` accepts `ButtonVariant` and `size`
accepts `ButtonSize`, and `'secondary'`/`'md'` are assumed here from the existing call sites; if the
variant is spelled differently, that is a two-token fix, not a redesign.

`INSTALL` is imported from `lib/pwa.ts`, which is safe in a client module: it is plain constants
with no `server-only`, no env read and no runtime anything, exactly as its header promises. **This
does not add anything to `lib/pwa.ts`** — the install *copy* lives here, with the component that
renders it, so `ci:openrouter-guard`'s grep over that file's comments is unaffected.

---

### Step 11: `components/push/PushSetup.tsx` and the card on `/me`

**Files:** `components/push/PushSetup.tsx` (new), `app/me/page.tsx:104` (after the Badges card,
before the Max-heart-rate card)
**Change:** a server component that reads the key and the count, and one `<Card>` on `/me`.

**Why `/me` and not `/nina`.** Three reasons. `/me` is where every other durable setting in this
app lives (the profile form, the HRmax panel, `AccountMenu`), and a permission toggle is a setting.
`/nina` is a conversation and phase 4 gave it a bespoke full-height layout with a fixed composer —
there is no natural place to put a settings card in it without fighting the scroll container that
phases 4, 7 and 8 all reason about. And `/me` is untouched by every other Nina phase except phase
1's one-line `sex` addition to the `ProfileForm` values literal (`phase-1.md:211`), so this insert
lands cleanly.

**Code — `components/push/PushSetup.tsx`:**

```tsx
import { requireUserId } from '@/lib/auth/requireUserId'
import { pushEnv } from '@/lib/env'
import { countLivePushSubscriptions } from '@/lib/push/queries'
import { PushSetupCard } from './PushSetupCard'

/**
 * The server half of the push control, and it exists for exactly one reason: **to read
 * `VAPID_PUBLIC_KEY` on the server and hand it to a client component as a prop.**
 *
 * The Next PWA guide would have `PushSetupCard` read `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY`
 * directly. This repo forbids the prefix outright (ROADMAP §4.1, `ci:client-secret-guard` RULE 3),
 * and `lib/env.ts` imports `server-only` so a client component cannot reach `pushEnv()` either.
 * A server wrapper is the whole resolution: one file, no exception in the guard, and the same
 * bytes end up in the browser.
 *
 * ── WHY IT SWALLOWS A MISSING KEY ─────────────────────────────────────────────────────────────
 * `pushEnv()` throws on a deployment that has no VAPID configuration, and phase 1 made it lazy
 * precisely so that such a deployment still serves `/` and `/r/[id]`. Letting it throw here would
 * take `/me` down with it — a profile page that 500s because notifications are not configured is a
 * worse failure than a profile page that says notifications are not configured.
 */
export async function PushSetup() {
  const userId = await requireUserId()

  let vapidPublicKey: string
  try {
    vapidPublicKey = pushEnv().VAPID_PUBLIC_KEY
  } catch {
    return <PushSetupFallback />
  }

  const live = await countLivePushSubscriptions(userId)

  return <PushSetupCard vapidPublicKey={vapidPublicKey} initiallySubscribed={live > 0} />
}

/** Shown when the environment has no VAPID keys. Says so plainly; it is a deploy problem. */
export function PushSetupFallback() {
  return (
    <p className="text-[13px] font-medium text-ink-2">
      Push notifications are not configured on this deployment.
    </p>
  )
}
```

**Code — `app/me/page.tsx`**, the import and the new card. The Badges card ends at `:104`; this
goes between it and the Max-heart-rate card:

```tsx
import { PushSetup } from '@/components/push/PushSetup'
```

```tsx
      <Card className="mb-4">
        <Eyebrow className="mb-3">Notifications</Eyebrow>
        <PushSetup />
      </Card>
```

**Impact:** `/me` gains one card and one more indexed query (`countLivePushSubscriptions`, through
`push_subscriptions_user_idx`). The page's docstring claims *"six reads, one `Promise.all`, no
model call"* — the count is a **seventh** read and it is deliberately **not** folded into that
`Promise.all`, because it belongs to `PushSetup`'s own component boundary and hoisting it into the
page would put push vocabulary into a function whose whole point is that every number on it is
stored or computed in TypeScript. The docstring's claim about no model call is untouched, which is
what F07's payload guard cares about. **Update the "six reads" wording to "six reads … plus one
inside `PushSetup`"** so the comment does not become a lie.

---

### Step 12: `next.config.ts` — the service-worker response headers

**File:** `next.config.ts:66-78` — a new entry at the **top** of the array `headers()` returns,
before the `/badges/:file*` entry
**Change:** one entry, two headers, and the paragraph that explains why the matcher is not the one
in the guide.

Headers in Next are additive across every matching `source`, so this entry coexists with the
`Service-Worker-Allowed` route the build inserts internally
(`next/dist/build/index.js:1662-1672`) rather than replacing it.

**Two headers, not three. `Content-Type` is deliberately omitted** — and this is the fourth
deviation from the guide. The guide sets `Content-Type: application/javascript; charset=utf-8` on
`/sw.js`, which is the right thing for a file you placed in `public/` yourself. Next already serves
`.next/static/service-worker/*.js` with a JavaScript content type through its static handler, and a
custom `Content-Type` on a response that already has one is the one header in this list that can
plausibly end up duplicated or fighting the framework — and a service worker whose MIME type the
browser will not accept fails to register with an error that names neither the header nor the
config. Leave it to the framework; if `registration` ever fails with *"The script has an
unsupported MIME type"*, that is the moment to add it back with a note, not before.

**Code:**

```ts
      /**
       * F33 phase 11 — the app's only service worker (`lib/service-worker.js`).
       *
       * ── WHY THIS MATCHER AND NOT THE GUIDE'S `/sw.js` ─────────────────────────────────────
       * `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` §8 sets these
       * headers on `/sw.js`, which is where a HAND-PLACED worker in `public/` would live. §2 of
       * the same guide — the part this app follows — registers a BUNDLED module via
       * `new URL('../../lib/service-worker.js', import.meta.url)`, and Next 16 compiles that into
       * `.next/static/service-worker/` and serves it from `/_next/static/service-worker/…`
       * (`next/dist/build/index.js:1657`). `/sw.js` matches nothing in this app, and a header
       * entry that matches nothing is worse than no entry: it looks like protection.
       *
       * The framework already supplies `Service-Worker-Allowed: /` on this path — which is what
       * lets a script served from `/_next/…` claim scope `/` — so it is deliberately NOT repeated
       * here. Two copies of that header on one response is how a scope failure becomes
       * intermittent.
       *
       * ── `no-store`, EVEN THOUGH NEXT ALREADY SENDS `max-age=0, must-revalidate` ────────────
       * `router-server.js:436` sets that default only `if (!res.getHeader('cache-control'))`, so
       * this entry wins cleanly. It is stricter on purpose: `must-revalidate` still permits a
       * shared cache to STORE the script, and the artefact this feature can leave behind on a
       * phone — a service worker from three deploys ago, handling pushes with last month's
       * payload contract — is the one worth spending a round trip to avoid. The script is fetched
       * on the update check, not on every page load, so the cost is close to nothing.
       *
       * The CSP is the guide's, verbatim and for its stated reason: the worker executes with it,
       * and it has no business loading anything from anywhere.
       */
      {
        source: '/_next/static/service-worker/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
```

**Impact:** the app has no app-wide CSP and gains none here — see Handoffs. Nothing else in
`headers()` moves; the `/badges/:file*` one-year immutable entry and the `/s/:token` block are
untouched, and neither matcher can overlap `/_next/…`.

---

### Step 13: flip phase 10's seam

**File:** `lib/nina/proactive.ts` — the `NOOP_NOTIFIER` line inside `emitProactiveMessage`
(`phase-10.md:1018`: `const notify = deps.notify ?? NOOP_NOTIFIER`), plus one import
**Change:** **one line**, exactly as phase 10 promised: *"`ProactiveDeps.notify` defaults to
`NOOP_NOTIFIER`. Phase 11 changes the default to its own sender in ONE place, marked in the code
below."*

**Code** — the added import:

```ts
import { pushNotifier } from '@/lib/push/send'
```

**Code** — the changed line:

```ts
  /* PHASE 11 LANDED. Was `NOOP_NOTIFIER`; the seam is now wired to the real Web Push sender.
   * `NOOP_NOTIFIER` is still exported and is still what the tests pass explicitly, which is why
   * it is not deleted — `tests/nina.proactive.test.ts` must keep running with no network. */
  const notify = deps.notify ?? pushNotifier
```

**Impact and the one thing to check.** `sendNinaPush` never throws (Step 7) and phase 10 calls
`notify` inside its own `try` after the rows commit (`phase-10.md:1065-1068`), so a push failure
still cannot cost a written message. But there is a **test consequence** the implementer must
verify rather than assume: any of phase 10's tests that call `emitProactiveMessage` **without**
passing `deps.notify` will now execute `pushNotifier`, which calls `pushEnv()` and
`listLivePushSubscriptions()` — an environment read and a database query in a suite that has
neither.

`sendNinaPush` degrades correctly (`pushEnv()` throws, it is caught, the report is
`skipped: 'VAPID not configured'` and it returns before touching the database), so a test with no
`VAPID_*` in its environment passes. **A test with `VAPID_*` set in `tests/support/setup.ts` would
reach the database and fail.** Check that file, and if the keys are there, pass
`{ notify: NOOP_NOTIFIER }` explicitly at those call sites. That is a change to phase 10's tests,
so it is listed under Handoffs as well.

`NOOP_NOTIFIER` is **not** deleted. It is a named seam with a docstring, it is what makes phase
10's tests hermetic, and deleting it would break them for no gain.

---

### Step 14: live arrival in an open `/nina`

Phase 10 explicitly assigned this here and left the recipe (`phase-10.md:2018-2024`); phase 4
flagged the missing `useEffect` (`phase-4.md:2137-2138`). Phase 10 rejected polling. **Do not
reintroduce polling** — no `setInterval`, no `refetch` on a timer.

The chain end to end: cron writes rows -> `pushNotifier` sends -> the worker's `push` handler shows
the notification **and** `postMessage`s every open window -> `ChatScreen` hears it and calls
`router.refresh()` -> the server component re-runs, `listNinaMessages` returns the new rows, a new
`initial` prop arrives -> a `useEffect` on `initial` merges it into state -> and phase 10's
`after(() => markNinaMessagesRead(userId))` clears the dot as a side effect of that same refresh.

**Note the limitation honestly: live arrival requires a push subscription.** The signal comes out
of the `push` handler, so a browser that has not subscribed (or an iPhone that has not installed
the app) still sees a cron message only on the next load. That is the correct trade rather than a
gap to paper over with polling: the alternative is every open tab hitting the server on a timer
forever, for a message that arrives a few times a day.

#### 14a: `lib/nina/live.ts`

**File:** `lib/nina/live.ts` (new)
**Change:** the whole file — the merge rule, pure, so it is testable under `environment: 'node'`.

**Code:**

```ts
/**
 * How a refreshed server list becomes the list on screen, without stepping on a reveal.
 *
 * ── WHY A MERGE AND NOT `setMessages([...initial])` ───────────────────────────────────────────
 * `ChatScreen` holds three kinds of row that the server list does not describe the same way:
 *   - an OPTIMISTIC row the runner just sent, which has a client-side id until the action returns;
 *   - a row mid-REVEAL, which is persisted (so it IS in the server list) but must not become
 *     `state: 'sent'` yet — RU-5's staggered reveal is the whole illusion, and re-seeding from the
 *     server would make all four of Nina's bubbles appear at once;
 *   - a row the server has and the client has not, which is the entire point of this refresh.
 *
 * Re-seeding wholesale gets all three wrong. The rule below is: **server order, local content.**
 *
 * Kept in `lib/nina/` and not `lib/push/` because it is about the conversation, not about push —
 * push is only what happens to wake it up.
 */

/** Kept in step with `LIVE_MESSAGE_TYPE` in `lib/service-worker.js`. */
export const SW_MESSAGE_TYPE = 'nina:new'

/** The only property this rule needs. `ChatMessage` (phase 4, widened by 6/7/8) satisfies it. */
export interface LiveMessage {
  id: string
}

/**
 * Server order, local content, local-only rows appended.
 *
 * Returns the **same array reference** when nothing changed, so a `useEffect` that calls
 * `setMessages(mergeServerMessages(current, initial))` on every refresh does not force a render
 * for a refresh that brought nothing new. React bails out of a state update that returns the
 * identical value.
 */
export function mergeServerMessages<T extends LiveMessage>(
  local: readonly T[],
  server: readonly T[],
): T[] | readonly T[] {
  const localById = new Map(local.map((message) => [message.id, message]))
  const merged: T[] = server.map((row) => localById.get(row.id) ?? row)

  const serverIds = new Set(server.map((row) => row.id))
  for (const message of local) {
    if (!serverIds.has(message.id)) merged.push(message)
  }

  const unchanged =
    merged.length === local.length && merged.every((message, i) => message === local[i])
  return unchanged ? local : merged
}
```

#### 14b: `components/nina/ChatScreen.tsx`

**File:** `components/nina/ChatScreen.tsx` — two imports, and two `useEffect`s placed immediately
after phase 4's `alive`/`timer` cleanup effect (`phase-4.md:1800-1806`) and **before** the
`visualViewport` effect
**Change:** no prop change, no state change, no signature change.

**⚠ COLLISION NOTE FOR THE RECONCILER.** Six phase plans touch this file: 3, 4 (creates), 6, 7, 8,
10 and this one. Phase 7's edit is the invasive one — it adds four props to `MessageBubble` and
makes that module `'use client'`. **This phase does not touch `MessageBubble.tsx`, `MessageList.tsx`
or `Composer.tsx` at all**, and inside `ChatScreen` it adds only two effects and two imports —
no prop, no state, no change to `handleSend`, no change to `NOTICE_TEXT`. If a merge conflicts, the
resolution is always "keep both": these effects are independent of every other phase's edit.

**Code** — the added imports:

```tsx
import { useRouter } from 'next/navigation'
import { mergeServerMessages, SW_MESSAGE_TYPE } from '@/lib/nina/live'
```

**Code** — inside `ChatScreen`, after the existing `alive`/`timer` effect:

```tsx
  const router = useRouter()

  /*
   * ── LIVE ARRIVAL, HALF ONE: hear the service worker ────────────────────────────────────────
   * F33 phase 11. `lib/service-worker.js`'s `push` handler posts `{ type: 'nina:new' }` to every
   * open window. `router.refresh()` re-renders `app/nina/page.tsx` on the server, which re-reads
   * `listNinaMessages` and hands this component a NEW `initial` — and, because the page's
   * `after(() => markNinaMessagesRead(userId))` runs again, clears the unread dot at the same time.
   *
   * `navigator.serviceWorker.addEventListener('message', …)` listens on the CONTAINER, so it works
   * whether or not this page is controlled by the worker and whether or not a registration exists
   * yet — which is why this component does not register anything. Registration is
   * `components/push/PushSetupCard.tsx`'s job and happens on `/me`.
   *
   * **Not polling.** Phase 10 rejected it and this is the alternative it named. Nothing here runs
   * on a timer; without a push there is no refresh, and a runner with no subscription sees a cron
   * message on the next load exactly as before.
   */
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown } | null
      if (data !== null && typeof data === 'object' && data.type === SW_MESSAGE_TYPE) {
        router.refresh()
      }
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [router])

  /*
   * ── LIVE ARRIVAL, HALF TWO: notice that `initial` changed ──────────────────────────────────
   * **This is the effect phase 4 flagged as missing** (`phase-4.md:2137-2138`), and without it half
   * one is useless: `useState(() => [...initial])` runs its initialiser exactly once, so a new
   * `initial` prop from `router.refresh()` would be ignored forever.
   *
   * `mergeServerMessages` is server order + local content, so a bubble mid-reveal keeps its local
   * state and an optimistic row the server has not seen yet is not dropped. It returns the same
   * array reference when nothing changed, so React bails out and a refresh that brought nothing
   * new costs no render.
   *
   * Phase 4's docstring says this component deliberately does not refresh after a send, and that
   * is still true — this effect is not on the send path. It fires when the SERVER hands down a
   * different list, which after this phase happens for exactly one reason: Nina spoke first.
   */
  useEffect(() => {
    setMessages((current) => mergeServerMessages(current, initial) as ChatMessage[])
  }, [initial])
```

**Impact:** an open `/nina` picks up a proactive message within a second of the push, with no
timer and no new route handler. Two behaviours to be aware of when testing:

- `router.refresh()` also re-renders the layout, so phase 10's `NinaUnreadBadge` re-counts. The dot
  therefore *appears and immediately clears* on an open `/nina`, which is correct.
- The `as ChatMessage[]` cast exists because `mergeServerMessages` returns `T[] | readonly T[]` to
  make the identity bail-out expressible. If the implementer prefers, widen `ChatScreen`'s state to
  `readonly ChatMessage[]` and drop the cast — that is a larger diff in a file five other phases
  are editing, which is why the cast is the recommendation.

---

### Step 15: the tests

**Files:** `lib/push/payload.test.ts` (new), `lib/nina/live.test.ts` (new)
**Change:** two co-located test files. `vitest.config.ts:36` includes `lib/**/*.test.ts`, so
co-located is sanctioned; phase 4 puts its pure-module tests the same way.

**Invariant 6 decides what is testable here.** `environment: 'node'`, no jsdom. So there is no test
of the service worker, no test of `PushSetupCard`, and no test of `webpush.sendNotification` — a
mock of `web-push` would assert that the mock was called, which is a test of the mock. What **is**
testable is precisely the three things in this phase that can be quietly wrong for a week: the
payload shape, the subscription parse, and the pruning decision. Plus the merge, because a merge
that drops a bubble mid-reveal is invisible until it happens on a phone.

**⚠ DO NOT add `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` to
`tests/support/setup.ts`.** It currently seeds `DATABASE_URL`, the five `LLM_*` keys,
`DATABASE_URL_UNPOOLED` and `BLOB_READ_WRITE_TOKEN` — and no VAPID. That absence is load-bearing
after Step 13: with no VAPID in the environment, `pushEnv()` throws inside `sendNinaPush`, which
catches it and returns before touching the database, so phase 10's tests keep passing against the
real `pushNotifier` with no network and no database. **Seeding dummy VAPID keys there would flip
that**: `configureVapid()` would succeed, `listLivePushSubscriptions()` would run against the dummy
Neon URL, and phase 10's proactive tests would start failing on a query. Nothing in this phase
needs those variables in a test.

**`lib/push/payload.test.ts`** — the cases, each one a claim that would otherwise only be checked
by a phone:

1. **`classifyPushFailure`, the whole table.** `404 -> 'gone'`, `410 -> 'gone'`, and then the
   omissions asserted as omissions: `429 -> 'retry'`, `500 -> 'retry'`, `503 -> 'retry'`,
   `401 -> 'retry'`, `403 -> 'retry'`, `400 -> 'retry'`, `null -> 'retry'`,
   `undefined -> 'retry'`. **403 gets its own named test** — "a rotated VAPID key must not delete
   every subscription" — because that is the failure this rule exists to prevent and a future
   reader tempted to add 403 to the terminal list must be stopped by a red test with a sentence in
   its name.
2. **`shouldRevokeSubscription`.** `{ verdict: 'gone', failureCount: 0 }` -> true (terminal beats
   the counter). `{ verdict: 'retry', failureCount: 0 }` -> false. The boundary, both sides:
   `failureCount: 3` -> false and `failureCount: 4` -> true, with a comment naming
   `PUSH_FAILURE_LIMIT = 5` as "the fifth consecutive failure revokes".
3. **`parsePushSubscription`.** A real-shaped FCM subscription (`endpoint`
   `https://fcm.googleapis.com/fcm/send/…`, `keys.p256dh`, `keys.auth`, plus an
   `expirationTime: null` that must be **ignored, not rejected**) flattens to three fields. Then
   the rejections: `null`, `{}`, a missing `keys`, an empty `p256dh`, `endpoint: 'not-a-url'`, and
   — the one that is a security claim rather than a validation claim — `endpoint:
   'http://evil.example/push'` returns `null` because the scheme is not `https:`.
4. **`truncateForNotification`.** A 40-character body comes back **identical and with no
   ellipsis** (the case that actually happens). A 400-character body comes back `<= 181` characters
   and ends with `…`. A 400-character body with spaces cuts on a space. A 400-character body with
   **no spaces at all** still truncates (this is the branch the `max * 0.6` guard exists for) and
   does not return three characters.
5. **`buildNinaPushPayload`.** Four bubbles produce **one** payload whose body is bubble zero —
   asserted explicitly, because "the notification is a knock on the door, not the conversation" is
   a design decision that a later change could silently reverse. `messageId` is bubble zero's id.
   `url` is `/nina`, `tag` is `nina`, `v` is `1`, `kind` is passed through opaquely (assert with a
   made-up kind like `'some_future_trigger'`, proving no switch statement needs editing).
   `[]` -> `null`. `[{ id: 'a', body: '   ' }]` -> `null`. `[{ id: 'a', body: '  ' }, { id: 'b',
   body: 'real' }]` -> body `'real'` and `messageId: 'b'` (the first **non-blank** bubble wins).
6. **`encodeNinaPushPayload` / `decodeNinaPushPayload` round-trip**, and then the compatibility
   claim `v` exists for: `decodeNinaPushPayload('{"title":"Nina","body":"hi","future":42}')`
   returns a payload with the defaults filled in and does **not** choke on the unknown field.
   `decodeNinaPushPayload('not json')` and `decodeNinaPushPayload('{"body":"no title"}')` return
   `null`.

**`lib/nina/live.test.ts`** — `mergeServerMessages`, with rows shaped as
`{ id, state }` (structural, so it does not import phase 4's `ChatMessage` and cannot be broken by
phases 6/7/8 widening it):

1. An identical local and server list returns the **same reference** — `expect(result).toBe(local)`.
   This is the render-avoidance claim and it is the one nobody would notice was broken.
2. A server list with one extra row at the end returns local content plus the new row.
3. A row present in both keeps the **local** object — `expect(result[0]).toBe(local[0])` — which is
   the mid-reveal case: the server says `sent`, the client says `revealing`, and the client wins.
4. A local-only row (an optimistic send the server has not committed yet) survives, and lands
   **after** the server rows.
5. Server order wins over local order when they disagree.
6. An empty local list takes the server list wholesale (a first load through the same code path).
7. An empty server list with local rows keeps the local rows — a refresh that raced a truncation
   must not blank the screen.

**Impact:** two files, both pure, both fast. `npm test` gains no database and no network.

---

## Verification

**Build:**

```
npm run format && npm run typecheck && npm run lint
```

**Tests and guards** — the client-secret guard is the one that matters most in this phase, and it
must be run after every step and not only at the end:

```
npm test
npm run ci:client-secret-guard
npm run ci:data-layer-guard
npm run ci:llm-payload-guard
npm run ci:openrouter-guard
npm run ci:f08-guard
npm run ci:f11-guard
npm run badges:check
```

**Local manual check — and it needs HTTPS.** A service worker only registers on a secure origin,
and `localhost` counts for registration but **iOS Safari's install flow does not work against
`http://localhost`**. Per the guide's §7:

```
rm node_modules && npm install                       # the symlink must go first — see Step 1
npx --yes web-push generate-vapid-keys               # paste both into .env.local
                                                     # add VAPID_SUBJECT=mailto:… too
npx next dev --experimental-https
```

Then, in order:

1. **Registration.** Open `/me`, DevTools > Application > Service Workers. One worker, source
   `/_next/static/service-worker/…`, status *activated*. Check the response headers on that URL:
   `Service-Worker-Allowed: /` (from Next) and `Cache-Control: no-cache, no-store,
   must-revalidate` (from Step 12). If the scope is not `/`, the matcher or the bundling is wrong.
2. **Subscribe.** Tap "Turn on notifications", accept the permission prompt. The card flips to
   "On". `select endpoint, user_agent, failure_count, revoked_at from push_subscriptions;` shows one
   row.
3. **The round trip.** Tap "Send me a test". A notification appears. **Tap it** — an already-open
   window is focused and navigated to `/nina`; with every window closed, one opens on `/nina`.
4. **Persistence across a restart** (an exit criterion, and the thing the guide's module-level
   `let` gets wrong). Stop the dev server, start it again, reload `/me`: still "On", still one row.
   Tap "Send me a test" again — it still arrives.
5. **The real path.** `curl -H "Authorization: Bearer $CRON_SECRET"
   https://localhost:3000/api/cron/nina -k` (phase 10's route). A notification arrives carrying
   Nina's first bubble, and the message is in `nina_messages`.
6. **Live arrival.** Leave `/nina` open on screen and fire the cron call from a terminal. **The new
   bubble appears with no reload**, and the unread dot does not linger.
7. **Pruning.** The honest test is to make an endpoint terminal:
   `update push_subscriptions set endpoint = endpoint || 'xxx';` then tap "Send me a test". The
   push service answers 404, and the row comes back with `revoked_at` set and `failure_count = 1`.
   Tap again: the card still says "On" (the browser subscription is real) but the report is
   `skipped: 'no live subscriptions'` — the row is not retried. Then unsubscribe and re-subscribe
   to get back to a good state, which also exercises the `revoked_at`-clearing upsert.
8. **The install prerequisite, on the actual phone.** On the iPhone XS Max in Safari, `/me` shows
   the install instruction and **no subscribe button**. Add to Home Screen, open from the icon, go
   to `/me`: now it shows the button. Subscribe, background the app, fire the cron call — the phone
   buzzes.

**Exit criteria** — all eight, each observable:

1. A subscription round-trips and **persists across a server restart** (check 4).
2. A proactive message from phase 10 delivers a notification whose **tap opens `/nina`** (checks 3
   and 5).
3. A message arriving while `/nina` is open **appears without a reload** (check 6).
4. The VAPID public key reaches the client **as a prop**, and `npm run ci:client-secret-guard`
   passes. `grep -rn "NEXT_PUBLIC_" app lib components` returns nothing on an executable line.
5. An expired or rejected subscription is **pruned, not retried forever** (check 7).
6. On iOS in a browser tab, `/me` shows a **real install instruction** instead of a button that
   cannot work (check 8).
7. `lib/service-worker.js` contains **exactly two** `addEventListener` calls — `push` and
   `notificationclick` — and no `fetch` handler and no cache API call anywhere:
   `grep -c addEventListener lib/service-worker.js` is `2`, and
   `grep -nE "caches|CacheStorage|'fetch'" lib/service-worker.js` is empty.
8. `npm run typecheck && npm run lint && npm test` and every `ci:*` guard pass, and
   `tests/pwa.install.test.ts` is still green — the install contract this phase depends on is
   unchanged.

---

## Handoffs

Work found and deliberately left, with the phase or card it belongs to.

- **Phase 10 — its own tests may need one argument.** Step 13 changes the `deps.notify` default
  from `NOOP_NOTIFIER` to `pushNotifier`. Any call to `emitProactiveMessage` in
  `tests/nina.proactive.test.ts` or `tests/nina.cron.test.ts` that does not pass `notify` now
  executes the real sender. It degrades safely today because `tests/support/setup.ts` seeds no
  `VAPID_*` — verified, that file seeds only `DATABASE_URL`, five `LLM_*` keys,
  `DATABASE_URL_UNPOOLED` and `BLOB_READ_WRITE_TOKEN`. **Passing `{ notify: NOOP_NOTIFIER }`
  explicitly at those call sites is the durable fix**, and it is phase 10's file, so it is named
  here rather than done.
- **Phase 13 — the avatar in the notification.** `lib/service-worker.js` hardcodes
  `icon: '/icons/icon-192.png'`, the app icon. When phase 13 owns `nina_avatars.is_current`, a
  notification carrying **her face** instead of the app's logo is a genuinely better version of
  this feature, and the seam already exists: add `icon` to `NinaPushPayload`, populate it in
  `buildNinaPushPayload` from the current avatar's blob URL, and the worker's existing
  `data.icon || fallback` read (add it) picks it up. **It is phase 13's call, not a change to make
  here** — a blob URL in a push payload is a cross-origin image fetch inside a worker, and that
  interacts with the CSP set in Step 12.
- **Phase 12 — a failed image generation could push too.** R22's in-character apology is a chat
  bubble. Whether it should also buzz is phase 12's decision; `sendNinaPush(userId, messages,
  kind)` takes any `kind` string and needs no change to serve it.
- **An app-wide security header block is a separate card.** The guide's §8 recommends
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and an app-wide `Referrer-Policy`.
  This phase deliberately adds none of them: `next.config.ts` sets `Referrer-Policy` on `/s/:token`
  only, with three paragraphs about the pathname being the bearer token, and promoting that to
  app-wide is a decision about the share feature. **The app also has no Content-Security-Policy at
  all** (verified: no `middleware.ts`, no CSP in `next.config.ts`), and
  `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` describes the
  nonce-based middleware approach that would be needed. That is its own card; a CSP added in
  passing by a notifications phase would break `next/font` and Recharts and nobody would know why.
- **Offline support and caching stay out.** `NINA_CHATBOT_PLAN.md:182-184`. The worker has no
  `fetch` handler and no lifecycle handlers, and exit criterion 7 asserts it. Next 16 ships an
  experimental `useOffline` hook and `experimental.useOffline` config
  (`progressive-web-apps.md:674`) which is a much smaller decision than Serwist if connectivity-aware
  UI is ever wanted — note it on that card.
- **A VAPID key rotation runbook.** Step 3 records the mechanics (a rotation makes every stored
  subscription answer 403, which is deliberately **not** pruned, so the fix is
  `DELETE FROM push_subscriptions;` plus a re-subscribe per device). It belongs in a runbook next
  to the blob-reap skill, not in this plan.
- **`push_subscriptions` rows with `revoked_at` set are never collected.** Deliberate: they are the
  only forensic trail for "why did my phone stop buzzing", and on a single-user app they are a
  handful of short URLs forever. If a sweep is ever wanted, it is one `DELETE` in the nightly cron
  and it is phase 10's file.
- **A "notify me about X but not Y" preference.** Not built. Every proactive kind pushes. If the
  runner ever wants the silence trigger to buzz but not the pattern trigger, the seam is
  `sendNinaPush`'s `kind` argument plus a column on `profiles`, and it is a new card.

---

## Rollback

**This phase does not roll back by reverting its commit, and that is the one thing to know before
shipping it.** Everything else in the plan set is additive to `lib/nina/`, `components/nina/` or
`app/nina/`; a service worker is different, because **a registered worker survives the deploy that
removes it.** `NINA_CHATBOT_PLAN.md:481-483` names this phase as the sticky one for exactly this
reason. A phone that has registered this worker keeps running it — with its `push` handler
intact — until something explicitly tears it down.

**The correct rollback, in order:**

1. **Stop the sends first.** Revert Step 13 alone: `deps.notify ?? pushNotifier` back to
   `deps.notify ?? NOOP_NOTIFIER`. One line, and it ends every notification immediately without
   touching a phone. If the reason for rolling back is "the notifications are wrong", **this is the
   whole rollback** and the rest is unnecessary.
2. **Then unsubscribe the devices.** `DELETE FROM push_subscriptions;` — nothing can be pushed to
   an endpoint the database does not hold. The worker stays registered but never receives a `push`
   event again.
3. **Only then remove the code**, and if the worker itself must go, **ship an unregister rather
   than deleting the file**: a temporary effect in `PushSetupCard` (or in the root layout, if the
   card is gone) that calls
   `navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()))`,
   left in place for at least one visit from every device, and removed in a later deploy. Deleting
   `lib/service-worker.js` without this leaves an orphaned worker on the phone that outlives the
   feature.

**Reverting the individual pieces**, for the record:

- `lib/push/*`, `components/push/*`, `lib/nina/live.ts` and the two test files are new files with
  no other readers: delete them.
- `next.config.ts`, `scripts/check-client-secret-boundary.mjs`, `package.json`, `.env.example` and
  `app/me/page.tsx` each revert to one contiguous block.
- `lib/env.ts`: removing `VAPID_SUBJECT` narrows `pushEnv()`'s return type; nothing outside
  `lib/push/send.ts` reads it, so the revert is safe once that file is gone.
- `components/nina/ChatScreen.tsx`: remove the two effects, the two imports and the `useRouter()`
  line. **Nothing else in that file was touched**, so the revert cannot conflict with phases 3, 6,
  7, 8 or 10.
- **No migration to undo.** Phase 1 created `push_subscriptions`; this phase adds no DDL.
