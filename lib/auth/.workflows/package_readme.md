# Package: auth · push · runs · trends (the user cluster)

**Location**: seven directories — anchored here at `lib/auth` because it is the cluster's (and the
app's) dependency root
**Last Updated**: 2026-09-12 (initial creation; every signature, constant and reverse-dependency
count below read and measured from the tree on this date — 22 files, 1,994 lines at measurement)

## Why one doc for seven directories

`lib/auth`, `lib/push`, `lib/runs`, `components/auth`, `components/push`, `components/runs` and
`components/trends` are the app's original vertical slice: sign in → see your runs → set a run's
intent → read the trends → get Nina's push when the app is closed. They were swept together by the
`auth-push-runs-trends-yagni` session (2026-09-12), share one import graph, and are small enough
that seven separate readmes would be seven headers around the same story. This file documents the
cluster; a session touching any member should read it whole — the cross-package flows at the
bottom are the part no per-package doc can carry.

Nothing else lives under these directories. `lib/service-worker.js` is *not* a member (it is a
separate bundle entry under `lib/`, kept in step with `lib/push/payload.ts` by comments, not by
imports) but it is documented here because the payload contract is.

## Scope map

| Directory | Files | Environments | Role |
|---|---|---|---|
| `lib/auth` | 3 | one `'use server'`, two plain server | The security boundary, sign-in/out actions, redirect sanitiser. |
| `lib/push` | 4 + 1 test | `'use server'`, three `server-only`/pure | Web Push: wire contract, subscription store, the one sender, the three actions. |
| `lib/runs` | 1 | `'use server'` | The run-intent write-back. One mutation, one column. |
| `components/auth` | 3 | server / plain | Sign-in card, sign-out button, account menu. |
| `components/push` | 2 | one server wrapper, one `'use client'` | The push control: VAPID key server→prop, browser state machine. |
| `components/runs` | 4 | server, one `'use client'` | The `/` list (RunList/RunRow), intent chips, provenance mark. |
| `components/trends` | 4 | server only | ACWR tile, delta line, scope switcher + period nav, compact week row. |

Zero client bundles come out of this cluster except `PushSetupCard` and `IntentChips` — every
other component is a Server Component by construction (no state, no callback), which is the
house rule the cluster predates and demonstrates.

## The boundary: `lib/auth/requireUserId.ts`

The published auth surface (F02 §1, INVARIANT A). **This file, not `proxy.ts`, is the actual
security boundary** — `proxy.ts` only bounces obviously-signed-out page navigations; every Server
Action and every protected Server Component opens with one of these instead.

```ts
export async function getUserId(): Promise<string | null>
export async function requireUserId(): Promise<string>       // redirects to '/' when signed out
export async function requireUserIdApi(): Promise<string>    // throws UnauthorizedError instead
export class UnauthorizedError extends Error { readonly status = 401 }
export function unauthorizedJson(): Response                 // the canonical 401 body
```

The rules that make it work, all load-bearing:

- **Flavours.** `requireUserId()` for pages and Server Actions (Next serialises the
  `redirect('/')` back to the client router). `requireUserIdApi()` + `unauthorizedJson()` for
  Route Handlers — a 307 to an HTML page is a terrible answer to `fetch()`. `getUserId()` only
  where signed-out is a legitimate state to render differently (`/` is the runs list *and* the
  sign-in screen, R-24; `NinaUnreadBadge`).
- **Call it FIRST** — before `formData`, before validation, before any DB access. It is a cookie
  decrypt with zero round trips (the whole reason F02 chose the JWT strategy).
- **Never wrap it in a bare try/catch.** `redirect()` signals by throwing `NEXT_REDIRECT`; a
  `catch { return { error } }` around it turns a sign-in bounce into a confusing error toast.
  Hoist the call above any `try`.
- **`redirect('/')`, not `unauthorized()`**: a `throw new Error()` surfaces as Next's generic
  error boundary — a red screen for the entirely normal state of a 30-day cookie expiring.
  Next 16's `unauthorized()` interrupt sits behind the experimental `authInterrupts` flag and
  "no feature flags" is a roadmap tenet. Revisit when it stabilises.
- Both exits of the signed-out path are control flow, so `requireUserId()` returns plain
  `string` and the call site needs no narrowing branch.
- `UnauthorizedError` is **imported, not redefined**, by `lib/admin/requireAdmin.ts` — one 401
  vocabulary serves both boundaries.

### `lib/auth/actions.ts` — sign in/out as Server Actions

```ts
export async function signInWithGoogleAction(formData: FormData): Promise<void>
export async function signOutAction(): Promise<void>
```

Thin wrappers so a client component can bind `signIn`/`signOut` (server-only) to
`<form action={…}>` without either crossing a `'use client'` boundary. Deliberately NOT in
`app/actions/`: that directory is for data mutations, these are navigation. `signIn()` throws
`NEXT_REDIRECT` internally — the never-bare-try/catch rule applies here too. The `next` hidden
field is sanitised twice: once by `safeNext()` at render, again inside the action.

### `lib/auth/safeNext.ts` — the open-redirect guard

```ts
export function safeNext(value: unknown): string   // same-origin path-relative, else '/'
```

`next` arrives from the query string (`proxy.ts` puts it there; anyone can type it), and an open
redirect on a sign-in path is a phishing primitive — a link on our own domain that takes a Google
password to someone else's login form. Rejected: absolute URLs, protocol-relative `//evil.com`
(a browser reads that as a host), and anything containing a backslash (some URL parsers fold `\`
into `/`). It lives in its own module because `lib/auth/actions.ts` is `'use server'`, where
every export must be an async function — a plain guard cannot live there. Unit-tested in
`tests/auth.safeNext.test.ts`.

## `lib/push` — Web Push, end to end

Four modules with one seam each: `payload.ts` is the pure vocabulary, `queries.ts` owns
`push_subscriptions` entirely, `send.ts` is the one place that talks to a push service, and
`actions.ts` is the browser's three entry points.

### `payload.ts` — the wire contract and the pruning rule (pure, no `server-only`)

No `server-only` on purpose: the module has no secrets and no I/O, and its job is to be
importable by the Server Actions, the sender, and its own test under `environment: 'node'`
(invariant 6, no jsdom). What is testable here — payload shape, subscription parse, the
give-up-on-an-endpoint decision — is exactly what can be quietly wrong for a week.

```ts
export const PUSH_BODY_MAX_CHARS = 180          // word-boundary truncation before the OS does it worse
export const PUSH_FAILURE_LIMIT = 5             // consecutive failures before revocation
export type PushFailureVerdict = 'gone' | 'retry'
export function classifyPushFailure(statusCode: number | null | undefined): PushFailureVerdict
export function shouldRevokeSubscription(input: { verdict; failureCount }): boolean
export interface PushSubscriptionInput { endpoint: string; p256dh: string; auth: string }
export function parsePushSubscription(value: unknown): PushSubscriptionInput | null
export interface NinaPushPayload { v: 1; title; body; url; tag; messageId: string | null; kind: string }
export function buildNinaPushPayload(input: { messages; kind }): NinaPushPayload | null
export function encodeNinaPushPayload(payload: NinaPushPayload): string
export function truncateForNotification(body: string, max?: number): string
```

The load-bearing decisions:

- **Pruning is 404/410 and nothing else** (RFC 8030 §7.3 — permanent by specification). The
  omissions are deliberate and each is a refusal to destroy state on the wrong signal: `429`
  (we were noisy, the subscription is alive), `5xx` (the push service is having a day), `400`
  (our bug — retrying is wrong but hiding it by deleting the runner's subscription is worse),
  and no-status-at-all (DNS/socket/timeout — the network, not the endpoint). **401/403 stay
  retryable because they are OUR VAPID problem**: a rotated key pair or a bad `VAPID_SUBJECT`
  answers 403 on every endpoint at once, and pruning on it would empty the table because of a
  typo in an environment variable. The test file carries the refusal in its own words: if you
  are here to add 403 to the terminal set, that is why you must not.
- **`shouldRevokeSubscription` never consults `lastSuccessAt`** — a subscription that succeeded
  once and failed five times since is exactly as dead as one that never succeeded, and "but it
  worked in March" only keeps corpses in the table. `failureCount` is the count BEFORE this
  failure; the comparison is against the incremented value.
- **`parsePushSubscription` treats its input as hostile even though the only caller is our own
  client component**: a Server Action is a public HTTP endpoint and an attacker-supplied
  `endpoint` string would turn `webpush.sendNotification` into a request-forgery primitive —
  which is why the scheme check is exactly `https:`, not a regex over the whole URL.
  `expirationTime` is dropped (no shipping browser sets it; a column for it would be a column
  of nulls).
- **The payload carries `v: 1` because the service worker cannot be type-checked against it.**
  `lib/service-worker.js` is plain JS, runs in a worker global, and may be a version older than
  the server pushing to it (a registered worker survives a deploy). A worker from last week
  reading a `v: 2` payload must still show *something*, so it reads defensively and ignores
  unknown fields. **Bump `v` only when a field's meaning changes, never on an addition — and do
  not silently repurpose a name.** The worker keeps `FALLBACK_URL = '/nina'` and the
  notification tag as "kept in step" constants (verified in the file, 2026-09-12);
  `encodeNinaPushPayload`'s docstring records that the worker does NOT import this module — it
  cannot import from `lib/` in a way that survives being a separate bundle entry.
- **One bubble, not the whole turn.** `buildNinaPushPayload` takes the first non-blank bubble as
  the body; the rest are deliberately not concatenated. The notification is a knock on the door,
  not the conversation — a four-bubble lock-screen wall destroys the staggered reveal RU-5 chose.
  The title is her name and never the message. `messageId` and `kind` are diagnostics-only.
- **`truncateForNotification`'s `max * 0.6` guard** exists for the CJK/hashtag case: a
  180-character blob with one space at index 3 must not be cut at index 3 to honour it.

### `queries.ts` — the whole read/write surface of `push_subscriptions`

`server-only`. Phase 1 shipped the table with no functions on purpose so that this, the only
code with an opinion about VAPID, owns them all.

```ts
export interface LivePushSubscription { id; endpoint; p256dh; auth; failureCount }
export async function savePushSubscription(userId, input): Promise<void>        // upsert on endpoint
export async function listLivePushSubscriptions(userId): Promise<LivePushSubscription[]>
export async function countLivePushSubscriptions(userId): Promise<number>
export async function deletePushSubscription(userId, endpoint): Promise<void>   // hard delete
export async function recordPushSuccess(userId, id, at?): Promise<void>
export async function recordPushFailure(userId, id, verdict, failureCount, at?): Promise<void>
```

- **Every function takes `userId` first and scopes on it — including the ones keyed by a
  globally unique endpoint.** `endpoint` is unique by RFC 8030, so `WHERE endpoint = $1` alone
  would be correct, and it is still wrong to write: it is an unscoped write against a shared
  table, and the next such function will not have the uniqueness argument going for it.
  (Belongs here and not `lib/db/queries.ts` by vocabulary — push is a third bounded context,
  the same reasoning that gave Nina her own `lib/nina/queries.ts`; invariant 7 still holds and
  the invariants script would pass these either way.)
- **Soft delete for a dead endpoint, hard delete for a human decision.** A push service's 410
  sets `revoked_at` and keeps the row — "which browser stopped answering, and when" is the only
  forensic trail this feature has. A runner tapping "Turn off" DELETES — a tombstone of an
  explicit choice would mean "off" is a state the database still holds an endpoint for.
- **`savePushSubscription` re-homes `user_id` on conflict, and that is not paranoia**: two
  Google accounts on one browser profile produce ONE endpoint, and whoever subscribed last owns
  that browser. Leaving the old owner would send this runner's messages to a row read under
  another user's id — the one bug in this codebase with no recoverable failure mode. Counters
  reset and `revoked_at` clears: a fresh `pushManager.subscribe()` is a fresh subscription even
  when the endpoint string matches (a re-subscribe that silently no-ops is the worst available
  bug here — the button says "on", the phone stays quiet).
- **`recordPushFailure` increments in SQL** (`failure_count + 1`), not from a value read in
  TypeScript, so two concurrent sends cannot both write "1". Revocation decided from the caller's
  count can be one behind under a race — the sixth failure instead of the fifth is an acceptable
  amount of wrong for a personal app, and saying so here is cheaper than a transaction.
  **`failureCount` is a required parameter — do not add a default of `0`**, which would silently
  disable the consecutive-failure ceiling.
- `listLivePushSubscriptions` returns a LIST because the same account on a phone and a laptop is
  two subscriptions; a single-row design would make installing the PWA on the phone silently
  unsubscribe the laptop.

### `send.ts` — the one place this app talks to a push service

`server-only`. `web-push` signs VAPID with `node:crypto`, encrypts with ECDH + HKDF + AES-GCM
(RFC 8291) and posts with `node:https` — none of which exists on the edge runtime, so every
route that can reach this module must be `runtime = 'nodejs'` (all are; `next.config.ts`
records it).

```ts
export async function sendNinaPush(
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: string,
): Promise<PushSendReport>   // { attempted, delivered, pruned, retryable, skipped }
export const pushNotifier: ProactiveNotifier   // the seam phase 10's deps call; logs the report
```

- **`pushNotifier` is `satisfies ProactiveNotifier` with a TYPE-ONLY import back from
  `lib/nina/proactive`** — that file imports `pushNotifier` from here, so the cycle exists only
  in the type graph and is erased by the compiler. **Do not turn it into a value import** to
  "tidy" it: that is a real require-cycle between two modules that both do work at import time.
  `satisfies` rather than an annotation so a change to `ProactiveNotifier`'s shape is a compile
  error HERE, at the seam.
- **It never throws.** The one thing that could (`pushEnv()` on a deployment with no VAPID keys)
  is caught before the loop and reported as `skipped`, because phase 10 calls this AFTER
  committing the message rows and a thrown notifier must never make a successful turn look like
  a failed one. This is the belt to phase 10's own brace; it is what makes a no-VAPID deploy
  behave as "no notifications" instead of "a warning per turn".
- **Sequential fan-out, one subscription's failure stops nothing** — same shape as the cron
  rollup's per-user loop: two subscriptions is the realistic maximum, `Promise.all` buys nothing
  measurable, and one rejection would abandon the remaining sends *and* their DB updates. A
  failure of the DATABASE update (not the send — that is already swallowed per-subscription)
  counts as retryable and keeps going.
- The prune verdict inside the per-subscription path is decided by **the same
  `shouldRevokeSubscription` call `recordPushFailure` makes** — there is exactly one function in
  this phase that decides whether a subscription is dead, and the report agrees with the
  database because both ask it.
- `PUSH_TTL_SECONDS` = 3 h, deliberately short: Nina's messages are about right now, and one
  that surfaces the following afternoon is not late, it is wrong. The message itself is never
  lost — it is a row in `nina_messages` and the unread dot is still on the tab.
- `setVapidDetails` mutates module state, so it runs once, memoised — never per send.
- Failures are logged (`console.warn` with the endpoint reduced to its host — 300 characters of
  which the host is the only informative part), never rethrown.

### `actions.ts` — the three writes a runner can cause

`'use server'`. Each opens with `requireUserId()` (invariant 7's reason every `queries`
function takes a userId it can trust).

```ts
interface PushActionResult { ok: boolean; message: string | null }   // module-private
export async function subscribeToPushAction(input: { subscription: unknown; userAgent? }): Promise<PushActionResult>
export async function unsubscribeFromPushAction(input: { endpoint: string }): Promise<PushActionResult>
export async function sendTestPushAction(): Promise<PushActionResult>
```

- **Result objects, not throws**: `PushSetupCard` has real failure states to render (permission
  denied, unsupported browser, malformed subscription) and a thrown Server Action gives the
  client an opaque digest — the wrong shape for "your browser said no". The `message` is copy
  the card renders verbatim; never a stack trace, never a status code.
- The subscription argument is `unknown` and parsed, not typed — a Server Action annotation is
  a comment; `parsePushSubscription` is where the `https:` check lives. `revalidatePath('/me')`
  after both writes so the server-rendered subscribed/unsubscribed state cannot disagree with
  the database on the next navigation.
- **The browser unsubscribes FIRST, the action deletes second** — the endpoint must be read off
  the live subscription before it is thrown away, and a browser-side failure must not leave the
  database claiming the phone is subscribed when it is not. The `typeof input.endpoint !==
  'string'` check is runtime defense on a public endpoint, not dead type-narrowing.
- **`sendTestPushAction` exists because the round trip cannot be verified any other way** — and
  it sends through `sendNinaPush` rather than a special path, so what it proves is the real
  thing. The fake message id `'test'` and kind `'manual_test'` are read by nothing, and
  phase 10's `ProactiveTriggerKind` is deliberately not imported: this is not a trigger.

## `lib/runs/actions.ts` — one mutation, one column

```ts
export async function setRunIntentAction(
  runId: string,
  intent: RunIntent | null,          // 'easy' | 'tempo' | 'long' | 'race' | null
): Promise<{ ok: true } | { ok: false; error: string }>
```

The intent write-back — the only mutation F08 owns (`runs.intent` is literally the answer to
F07's "was this meant to be an easy run?", so the question belongs to F07 and the chip row that
answers it to F08). `requireUserId()` is line one; `isValidId` and the `RUN_INTENTS` membership
check run even though the query is scoped anyway. Two deliberate refusals to do more:

- **It does not touch `corrected_at`** — intent is not a correction of anything a model read,
  and stamping it as one would pollute the extraction error profile.
- **It does not evaluate badges** — no badge reads `intent`. If one ever does, the hook belongs
  in `lib/derived/invalidate.ts` (the seam F05 cut for exactly this), not bolted on here.
- The catch is shapeless on purpose: a missing run, a foreign run and a database hiccup are the
  same outcome to this caller — the chip did not stick. Distinguishing them would be an
  ownership oracle (queries.ts §1).

## `components/auth` — the sign-in surface

- **`SignInCard`** is the signed-out state of `/` (R-24 — there is no separate marketing page):
  app name, one line of purpose, one button. A plain `<form>` posting to a Server Action, so it
  works before hydration and ships no client JavaScript; `next` rides in a hidden input and is
  sanitised twice (see `safeNext`).
- **`SignOutButton`** is the sign-out affordance, same no-JS form trick. `ghost`, not `primary`:
  the design's rule is one filled button per screen, and leaving is never the screen's main
  action.
- **`AccountMenu`** is the one component that reads `auth()` directly — because it is the one
  place that wants the profile (name, email) rather than the id. Everything else in the app
  goes through `requireUserId()`. Renders `null` when signed out.

## `components/push` — the push control

- **`PushSetup`** (server) exists for exactly one reason: **to read `VAPID_PUBLIC_KEY` on the
  server and hand it to a client component as a prop.** The Next PWA guide reads
  `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` in the client; **this repo forbids the prefix
  outright** (ROADMAP §4.1, `ci:client-secret-guard` RULE 3 greps for the literal and fails
  unconditionally), and `lib/env.ts` imports `server-only` so no client can reach `pushEnv()`.
  The prop is the whole resolution: the guard stays absolute instead of growing its first
  exception, and a VAPID public key is public by construction — the same bytes reach the
  browser either way. **Do not "fix" this back to the documented version; the guard will fail,
  and it will be right.** `pushEnv()` is lazy and THROWS when the group is unset — correct
  everywhere else, wrong on `/me`, so it is caught here and the fallback says plainly that push
  is not configured on this deployment (a deploy problem, not a runner-facing error).
- **`PushSetupCard`** (`'use client'`) is the browser half, and its header is the one place this
  app deliberately ignores Next's PWA guide — with the reason written down so nobody reverts it.

  The support state machine, decided once on mount: `probing` (renders as the server-known
  state, no flash of "unsupported") → `ready` / `needs-install` / `denied` / `unsupported`.
  `needs-install` is iOS-in-a-tab, where `PushManager` is genuinely absent: Web Push on iOS
  16.4+ reaches only an installed PWA, so the install instruction renders *instead of* the
  button — a subscribe button there would throw on tap.

  The rules worth keeping:

  - **Service worker registration lives here and only here.** `register()` is idempotent, but
    one place means one answer to "when does this app install a worker": when the runner opens
    `/me`. `ChatScreen` only LISTENS and does not register (its comment says so). The
    registration URL is a bundled module (`new URL('../../lib/service-worker.js',
    import.meta.url)`) — Next compiles it into `.next/static/service-worker/` and serves it
    with `Service-Worker-Allowed: /`, which is what makes `scope: '/'` legal from a `/_next/…`
    URL; `updateViaCache: 'none'` keeps the browser's HTTP cache out of the update check.
  - **The browser, not the database, is the authority on whether THIS device is subscribed.**
    After registering, the card re-reads `pushManager.getSubscription()`; a phone that cleared
    its site data shows "off" even though the row survives — correct, and the next send prunes
    the row.
  - `urlBase64ToUint8Array` builds over an explicitly allocated `ArrayBuffer` so the return type
    is `Uint8Array<ArrayBuffer>` and satisfies `BufferSource` under TS 5.9's generic typed
    arrays — the guide's `new Uint8Array(length)` infers `ArrayBufferLike` and does not
    typecheck here.
  - `subscription.toJSON()` (not the host object) crosses to the Server Action — a
    `PushSubscription` has methods; an action argument must be serialisable.
  - **Unsubscribe reads the endpoint BEFORE `subscription.unsubscribe()`** — the row is keyed by
    endpoint, and the reverse order is how a database ends up claiming a phone is subscribed
    when it is not.
  - The `alive` ref guards every async continuation (StrictMode double-invokes effects in dev;
    a runner can navigate away mid-await — the same guard `ChatScreen` and `InsightTrigger`
    use). A `NotAllowedError` from `subscribe()` is the runner tapping "Don't Allow": the only
    branch that changes `support`, and not an error to apologise for.

## `components/runs` — the `/` list and the run detail's honest marks

- **`RunList`** groups by ISO week, newest week first, newest run first inside it. **The week
  divider's totals are computed from the rows being listed, never from a second query** — two
  queries answering "how far did I run this week" is two chances to disagree on one screen; one
  reduce over the array already on the page cannot. Grouping relies on the input contract
  (reviewed-only, newest-first, exactly as `listRuns` returns them, D16) plus `Map` insertion
  order: no second sort, no date comparison in this file. `todayISO` is passed in so "THIS
  WEEK" cannot mean two things in one render (D6). The current week's divider says "This week"
  (the date is noise at the top of your own list); every other divider is dated, since
  scrolling back three months without dates is guessing. Not sticky — nothing publishes a
  header-height token to key a sticky offset off, and a divider that sticks under a header it
  cannot measure lands on the first row.
- **`RunRow`** is one row of `/`, a Server Component (no state, no callback, no client bundle).
  The whole row is the link — on a 414px screen a 44pt target that fills the row is the
  difference between a list you can flick through one-handed and one you aim at. Three lines in
  a fixed order: identity (day, photo count), what the run WAS (distance, duration), how it
  FELT (pace, avg HR, location).
- **`IntentChips`** (`'use client'`) is the intent chip row — the only mutation on the run
  detail page besides Share. Four outline chips when unset; once set, **the chosen chip alone
  remains, filled** (a fact about the run, not a filter — three greyed alternatives next to the
  answer invite second-guessing). **Tapping the filled chip clears it**: "tap to set once" is
  the intent, but a mis-tap on a phone must be undoable, and `aria-pressed` already announces a
  toggle. `useOptimistic` inside `startTransition` rather than a `useState` mirror: the chip
  fills the instant it is tapped and React reverts automatically when the transition ends —
  succeeded (prop changed, nothing moves) or failed (prop unchanged, chip snaps back). A
  `useState` copy kept in step by an effect is the version that lints, re-renders twice, and
  gets the failure case wrong. No `<form>`: nothing to validate, nowhere to navigate.
- **`ProvenanceMark`** is the honesty rule on the saved screen — read-only and run-level
  (`⌁ Read from screenshot · 2 fields corrected · reviewed 20 Aug · edited 22 Aug`). Per-field
  provenance belongs to F05's review screen, the only place a field is still editable; here the
  question is "can I trust this row?" **No colour, ever** — a corrected run is a run someone
  took MORE care over, and tinting it amber would say the opposite; the glyph plus words carry
  it (screenshot in greyscale and nothing is lost). `reviewed_at` ("has a human ever confirmed
  this?") and `corrected_at` ("when did one last change it?") are two different questions (R-8);
  both printed when both exist, neither inferred from the other. `correctedFieldCount` is
  F05's data — this component only counts it.

## `components/trends` — the comparative screen

All four are Server Components; `/trends` is the one screen of the cluster with zero client
JavaScript.

- **`AcwrTile`** renders the acute-to-chronic workload ratio (7-day distance ÷ trailing 28-day
  weekly average; R-6 is why rolling, F06 computes it). **Withheld entirely under four weeks of
  history** — a 4-day "chronic" load is not a chronic load, and a ratio computed against one is
  a made-up number wearing a decimal point. Flagged only outside 0.8–1.3, and flagged as a
  *fact* ("outside the usual range") rather than an alarm — "⚠️ Injury risk!" is a medical
  claim this app does not make. The band itself is printed so "outside" needs no look-up.
- **`DeltaLine`** renders "4 runs · ↑ 12% vs last week" and the two states that are not a
  percentage: `none` (nothing in either period — "0%" would imply there was something to
  compare) and `first` (last period zero — the percentage would be +∞; say what happened).
  Direction is carried by an arrow and the word "vs", never by colour alone.
- **`ScopeSwitcher` + `PeriodNav`** — the segmented control and the `‹ Week of 10 Aug 2026 ›`
  header. **Links, not a client component**: switching scope or paging a month changes which
  rows the server queries, so it is a URL change either way — an `<a>` does that with no
  JavaScript, no hydration wait, prefetch for free, and a working middle-click. (F08's plan
  listed ScopeSwitcher as client; its own §7 rule — "the scope switcher DOES need a query param
  and a server re-fetch" — taken to its conclusion. The one genuinely client-stateful control
  in the feature stays the pace-trend band filter, which is not in this cluster.) The forward
  chevron **disappears at the present rather than being disabled** — a greyed control that
  never becomes usable is a promise the app cannot keep; a spacer keeps the title centred
  without claiming somewhere to go.
- **`CompactRunRow`** is deliberately NOT the `/` list row. On `/trends` the question is
  comparative ("which of these four was the outlier?"), so day/distance/pace line up in fixed
  columns with tabular figures; on `/` the question is "what was this run?" and the row stacks,
  leading with distance. Same data, different reading, two components — merging them would
  compromise both.

## Internal architecture — the cluster's flows

```
SIGN-IN (the only door)
  proxy.ts ── bounces signed-out pages to '/' with ?next=<intended>
  app/(app)/page.tsx: getUserId()               ← signed-out is legitimate HERE (R-24)
    ├─ null → SignInCard(next=safeNext(…)) ── form ── signInWithGoogleAction
    │            └─ signIn('google', { redirectTo: safeNext(formData.get('next')) })
    │                 └─ root auth.ts (adapter + JWT cookie; authEnv() validated loudly at boot)
    └─ user → RunList(reviewed runs)

EVERYWHERE ELSE
  app/**/page.tsx, lib/**/actions.ts ── requireUserId()        ← line 1, never in try/catch
  app/api/**/route.ts               ── requireUserIdApi() + unauthorizedJson()
  lib/admin/requireAdmin.ts         ── reuses UnauthorizedError; adds the admin email check

RUN DETAIL
  app/r/[id]/page.tsx ── ProvenanceMark (read-only honesty) + IntentChips
      └─ tap chip → setRunIntentAction ── requireUserId → isValidId → RUN_INTENTS
            → setRunIntent (scoped; never touches corrected_at; no badge hook)
            → revalidatePath('/r/<id>')

PUSH (the only out-of-app channel in the cluster)
  /me ── PushSetup (server) ── pushEnv().VAPID_PUBLIC_KEY ──prop── PushSetupCard (client)
      └─ registers lib/service-worker.js (HERE and only here; scope '/', bundled module)
      └─ subscribe() → subscription.toJSON() → subscribeToPushAction
            → parsePushSubscription (https:-only) → savePushSubscription (upsert, re-homes user)
            → revalidatePath('/me')
  later, when Nina writes:
  lib/nina/proactive.ts ── pushNotifier ── sendNinaPush
      → buildNinaPushPayload (first bubble) → encodeNinaPushPayload
      → listLivePushSubscriptions → for each: sendNotification (VAPID, TTL 3h)
            ├─ ok → recordPushSuccess (streak reset)
            └─ WebPushError → classifyPushFailure → recordPushFailure (SQL increment;
                   shouldRevokeSubscription → revoked_at) → 'pruned' | 'retryable'
      → service worker 'push' handler → showNotification (defensive read, kept-in-step constants)
      → tap → FALLBACK_URL '/nina' → focus-or-open
```

The dependency direction is one-way and acyclic at runtime: components → lib packages →
`@/auth` / `@/lib/db` / `@/lib/env`; the single back-edge (`lib/nina/proactive` ⇄ `lib/push/send`)
is type-only and documented at both ends. `proxy.ts` deliberately does not import root `auth.ts`
(that split is `auth.config.ts`'s story, outside this cluster).

## Dependencies

### Internal

- `@/auth` (root `auth.ts`) — the Auth.js instance: `auth()` for reads, `signIn`/`signOut` for
  the actions. Adapter + JWT together: the adapter writes `user`/`account` rows (real FK, free
  cascade on user delete) while the session lives in the cookie — no session rows, ever.
- `@/lib/env` — `pushEnv()` (`send.ts`, `PushSetup`) and `authEnv()` (boot validation lives in
  root `auth.ts`). Lazy, throws when the group is unset — caught only where "unset" has a
  legitimate rendering (`PushSetup`'s fallback), propagated everywhere else.
- `@/lib/db` + `@/lib/db/schema` — drizzle handle, `pushSubscriptions`, `RunIntent`.
- `@/lib/db/queries` — `setRunIntent`, `RUN_INTENTS` (`lib/runs`; push's writes live in
  `lib/push/queries.ts` instead, by bounded-context vocabulary).
- `@/lib/nina/proactive` — `ProactiveNotifier`, **type-only** (see `send.ts`).
- `@/lib/metrics` — `Acwr`, `isAcwrOutOfRange`, `ACWR_SWEET_SPOT`, `VolumeDelta`.
- `@/lib/format`, `@/lib/date/ranges` — every number and date the components print
  (`formatDistanceKm/M`, `formatPace`, `formatDayShort/Compact`, `isoWeekKeyOf`,
  `isoWeekLabel`, `jakartaDayOf`).
- `@/lib/id` — `isValidId` shape check before any claimed id reaches a query.
- `@/lib/pwa` — `INSTALL.shortName` in the iOS install hint copy.
- `@/components/ui` — `Button`, `Chip`, `Stat`.

### External

- `web-push` — named imports only (`@types/web-push` declares no default; `import webpush from
  'web-push'` does not typecheck here even with `esModuleInterop`). Node runtime only.
- `zod` — the subscription parse (`payload.ts`).
- `next/navigation`, `next/cache` — `redirect`, `revalidatePath`.
- React — `useOptimistic`/`useTransition` (`IntentChips`), the probing effects (`PushSetupCard`).

## Reverse dependencies

Import-site census: `grep` for the `@/` specifier across `app/ components/ lib/ tests/
scripts/` plus root `auth.ts`/`auth.config.ts`/`proxy.ts`, `.workflows/` plan copies excluded;
**measured 2026-09-12** — counts are matching FILES, including co-located tests and `vi.mock`
factories, and rot the moment a route is added. Re-measure before relying on a count.
`lib/push/payload` shows zero `@/` importers because its consumers (`actions`, `queries`,
`send`, the co-located test) import it relatively, inside the package — by design.

| Module | Importers | Notes |
|---|---|---|
| `lib/auth/requireUserId` | 34 | The app-wide boundary: 19 app routes/pages, 2 components (`NinaUnreadBadge`, `PushSetup`), 13 lib action modules incl. `lib/admin/requireAdmin` (for `UnauthorizedError`). |
| `lib/auth/actions` | 2 | `SignInCard`, `SignOutButton`. |
| `lib/auth/safeNext` | 2 (+1 test) | `app/(app)/page.tsx`, `tests/auth.safeNext.test.ts`. |
| `lib/push/actions` | 1 | `PushSetupCard` — the only UI bound to the three writes. |
| `lib/push/queries` | 1 external (+in-package) | `PushSetup` (`countLivePushSubscriptions`); `actions.ts` relatively. |
| `lib/push/send` | 1 | `lib/nina/proactive.ts` — the notifier seam. |
| `lib/push/payload` | 0 by `@/` | In-package relative imports + co-located test. |
| `lib/runs/actions` | 1 | `IntentChips`. |
| `components/auth` | 2 pages | `app/(app)/page.tsx` (SignInCard), `app/me/page.tsx` (AccountMenu). |
| `components/push` | 1 page + 2 prose refs | `app/me/page.tsx`; `lib/service-worker.js` and `ChatScreen.tsx` name `PushSetupCard` in comments (registration ownership), not imports. |
| `components/runs` | 2 pages + 1 test | `(app)/page.tsx` (RunList), `r/[id]/page.tsx` (IntentChips, ProvenanceMark), `tests/views.render.test.ts`. |
| `components/trends` | 1 page | `app/trends/page.tsx` — all four components at once. |

Test coverage, honestly stated: `lib/push/payload.test.ts` (co-located) covers the
node-testable surface — classify/shouldRevoke/parse/truncate/build — and is deliberate about
what it does NOT cover (everything needing a browser, a push service or a phone).
`tests/auth.safeNext.test.ts` covers the guard. `tests/views.render.test.ts` renders the runs
list. **`recordPushSuccess`/`recordPushFailure` and all of `send.ts`/`actions.ts` have no
tests** (they need a DB / a push service); the `at:` seams on the record functions are ready if
that test ever gets written — a real-database test for them would be a higher-value session
than any further refactor here. Suites for `share`/`review`/`nina` actions exercise
`requireUserId` transitively through `vi.mock` factories (a factory's export list is a real
dependency: it must name every export the tested module imports).

## Concurrency

No locks, no channels; the interesting facts are the runtime's:

- **Server Actions are dispatched one at a time per client** — why `PushSetupCard`'s buttons
  share one `busy` flag and why nothing here needs request coalescing.
- **Races are settled by Postgres, not by application code**: `endpoint` unique +
  `onConflictDoUpdate` (which also decides two-Google-accounts-one-browser ownership);
  `failure_count + 1` in SQL (two concurrent sends cannot both write "1"). The known
  imperfection is named where it lives: revocation can lag one failure behind under a race.
- **The push fan-out is sequential on purpose** (see `send.ts`) — `Promise.all` would buy
  nothing measurable and risk abandoning DB bookkeeping.
- **Client effects are guarded, not assumed**: `PushSetupCard`'s `alive` ref (StrictMode
  double-invoke, navigation mid-await) and per-effect `cancelled` flags; `IntentChips` leans on
  `useOptimistic`'s automatic revert instead of keeping state in step manually.
- The pure modules (`safeNext`, all of `payload.ts`, every component here except the two client
  ones) hold no state and are safe to share across requests by construction.

## Error handling

Two vocabularies, split by caller, never mixed:

- **Boundary = control flow.** `redirect('/')` (`NEXT_REDIRECT`) for pages/actions;
  `UnauthorizedError` → `unauthorizedJson()` for Route Handlers. Both must be allowed to throw
  — no bare try/catch across them.
- **Actions = result objects.** `setRunIntentAction` and the three push actions return
  `{ ok, error? | message? }`; the message/error strings are runner-readable sentences
  ("Could not save that just now", "That subscription did not look right. Try again."), never
  status codes or stack traces. An action's honest answer to malformed browser input is
  `ok: false`, not a 500 in the console.
- **The sender never throws** — the one throw-shaped condition (missing VAPID) is reported as
  `skipped`, because its caller has already committed the user-visible rows.
- **Failures are logged with the minimum informative form**: structured `console.warn` lines
  (`[push] send failed`, endpoint → host only) — loud enough to find, small enough to read.

## Usage

### Adding a protected surface

```ts
// page or Server Action
export default async function Page() {
  const userId = await requireUserId()      // line 1, above any try and any formData read
  const runs = await listRuns(userId)       // always userId-scoped
}
// Route Handler
export async function GET() {
  try {
    const userId = await requireUserIdApi()
    /* … */
  } catch {
    return unauthorizedJson()
  }
}
```

### Adding a push-adjacent behaviour

Send through `sendNinaPush` (never a parallel path — the test button proves the real chain
because it IS the real chain); decide revocation only via `classifyPushFailure` +
`shouldRevokeSubscription`; new payload fields are additions (no `v` bump), changed meanings
are not.

### Gotchas — the do-not list

- **Never bare-try/catch `requireUserId()` or the sign-in action.** `NEXT_REDIRECT` is thrown
  on purpose; swallowing it turns a sign-in bounce into an error toast.
- **Route Handlers use `requireUserIdApi()`, never `requireUserId()`.** A 307 to HTML is not an
  API answer.
- **Do not reach for `NEXT_PUBLIC_*` in this cluster** — or anywhere; the guard fails
  unconditionally and is right. The server-wrapper→prop pattern (`PushSetup` → `PushSetupCard`)
  is the resolution, not a workaround to simplify away.
- **Do not add 401/403 to the terminal status codes.** Rotated-VAPID would prune every
  subscription in the table; the test file says so in its own words.
- **Do not give `recordPushFailure`'s `failureCount` a default of `0`.** It silently disables
  the consecutive-failure ceiling; a caller without a count must SELECT first.
- **Do not scope a push query on `endpoint` alone** — unique or not, unscoped writes against a
  shared table are the failure mode, and userId-first is the rule.
- **Do not concatenate Nina's bubbles into one notification body.** One bubble; the test pins
  it.
- **Do not move the service worker registration out of `PushSetupCard`.** One answer to "when
  does this app install a worker" is worth more than the idempotence register() already gives.
- **Do not make `send.ts`'s `ProactiveNotifier` import a value import.** The cycle is real the
  moment it survives compilation.
- **Do not bump `NinaPushPayload.v` for an added field** — only for a changed meaning, and then
  branch in the worker (which may be a week older than the server and must still show
  something).
- **`'use server'` files export async functions only** — that is why `safeNext` is its own
  module; do not fold a guard into an actions file.
- **`setRunIntentAction` does not touch `corrected_at` and does not evaluate badges.** The
  badge hook's home, if one is ever needed, is `lib/derived/invalidate.ts`.
- **RunList's divider totals come from the rows in hand** — never a second query answering the
  same question as the array already on the page.
- **Do not client-ify `ScopeSwitcher`/`PeriodNav`.** They are links because scope and period
  are server query parameters; the URL change IS the feature.
- **Do not add colour to `ProvenanceMark`.** Corrected is not a warning; greyscale must lose
  nothing.
- **Do not merge `CompactRunRow` into `RunRow`.** Comparative columns and a stacked list row
  are different readings of the same data; one component serves neither well.

## Notes

- **Swept clean, once.** The `auth-push-runs-trends-yagni` YAGNI sweep (2026-09-12, commit
  `04e79fe`) read all 22 files end to end and found the cluster's dead-code budget to be one
  function (`decodeNinaPushPayload`), eight export keywords, and one never-passed prop — the
  rest is documented decisions. A future session should not re-sweep these directories
  expecting more; the verified-alive ledger from that sweep (injection-parameter defaults,
  the deliberate omissions in the pruning rule, the `null`-endpoint runtime check) is now
  captured in the sections above.
- **Documentation created 2026-09-12** by token-maxxing session `pkg-readme-auth-push-runs`
  (worker branch `token-maxxing-2026-09-12-pkg-readme-auth-push-runs`), as one combined doc per
  the coordinator's premise: the seven directories were swept together and share one import
  graph and one natural doc scope. Anchored at `lib/auth/.workflows/` — the cluster's
  dependency root — because a combined scope has no single package to live in and the boundary
  module is what every other member transitively answers to.
- Per-task history lives in `git log` over the seven directories; this file carries decisions
  and contracts, not changelogs. Reverse-dependency counts and the cluster line total are
  stamped with their measure date — re-measure before quoting them.
