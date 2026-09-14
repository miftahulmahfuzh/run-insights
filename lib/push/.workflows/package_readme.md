# Package: push

**Location**: `lib/push`
**Last Updated**: 2026-09-14
**Documentation Created**: 2026-09-14

## Overview

`lib/push` is the whole of this app's Web Push implementation: the wire format Nina's
notifications travel in, the `push_subscriptions` read/write surface, the VAPID-signing sender, and
the three Server Actions a runner's tap reaches. It is the only place that talks to a push service,
and the only place with an opinion about VAPID.

Its shape is set by two facts that are easy to forget and expensive to rediscover. First, the
counterpart half of the wire format — `lib/service-worker.js` — **cannot be type-checked and may be
a registration older than the deploy pushing to it**, so `NinaPushPayload.v` exists and additions
are additions, never meaning changes. Second, a notification is always a courtesy: every message
row is committed before anything here is called, and nothing in this package may turn an
unreachable phone into a failed turn.

**Key responsibilities:**
- Define the payload contract with the service worker (`payload.ts`), including the closed
  `NINA_PUSH_KINDS` diagnostic vocabulary.
- Decide when a subscription is dead — terminal status code, or a consecutive-failure ceiling.
- Fan a turn out to every live subscription for a user, signing with VAPID, recording the outcome.
- Offer message writers one never-throwing door (`notifyNinaPush`) and proactive turns their
  `ProactiveNotifier` (`pushNotifier`).
- Own the runner-facing subscribe / unsubscribe / send-a-test Server Actions.

## Module Map

| File | Boundary | Role |
| --- | --- | --- |
| `payload.ts` | **no `server-only`, no I/O** — deliberately | Wire format, kind vocabulary, pruning rules, subscription parsing |
| `queries.ts` | `server-only`, database | The whole of `push_subscriptions`' read/write surface |
| `send.ts` | `server-only`, network + database | VAPID config, the fan-out, and the two caller-facing notifiers |
| `actions.ts` | `'use server'` | `subscribeToPushAction`, `unsubscribeFromPushAction`, `sendTestPushAction` |
| `payload.test.ts`, `send.test.ts` | `environment: 'node'`, no jsdom | Unit coverage; there is no `self`/`navigator`/`PushSubscription` in a test |

### Why `payload.ts` has no `server-only` — and must not gain one

This is load-bearing, not an oversight. `payload.ts` is imported by the Server Actions, by the
sender, by its own test, and — from phase 5 of the `NINA_PUSH_EVERY_MESSAGE_PLAN.md` set onward —
by the off-platform image worker under `scripts/nina-image-worker/`, which runs on a GitHub runner
under `node --experimental-strip-types` with no bundler. That process cannot resolve `@/` aliases
and cannot import `server-only`; it reaches this module through a relative
`../../lib/push/payload.ts` specifier. Adding `server-only`, an `@/` import, or any I/O to
`payload.ts` breaks that consumer.

The same constraint is why `payload.ts` does **not** import `ProactiveTriggerKind` from
`lib/nina/prompts` — it spells the five trigger names out by hand instead, and the two lists are
pinned together by a single typed local in `send.ts` (see "The subset pin" below).

## Exported API

### `payload.ts`

#### Constants

```ts
export const PUSH_BODY_MAX_CHARS = 180
export const PUSH_FAILURE_LIMIT = 5
export const NINA_PUSH_KINDS = [...] as const
```

- `PUSH_BODY_MAX_CHARS` — truncation happens here rather than at the OS, so the cut lands on a word
  boundary with an ellipsis. Also keeps a long Indonesian bubble clear of the ~4 KB encrypted
  payload ceiling.
- `PUSH_FAILURE_LIMIT` — consecutive failures before revocation. Five is a choice, not a discovery:
  Nina speaks a handful of times a day, so five straight failures spans days and is evidence about
  the subscription rather than about the weather.
- `NINA_PUSH_KINDS` — the closed diagnostic vocabulary, below.

#### `NINA_PUSH_KINDS` / `NinaPushKind`

```ts
export type NinaPushKind = (typeof NINA_PUSH_KINDS)[number]
```

Every push this app sends is stamped with one of these. `kind` is **diagnostics only** — it reaches
the wire, the log line, and nothing else — but it is a closed list anyway, because it is the field
a human reads at 2am to answer "which of the places Nina writes a message sent this?", and a free
string answers that with typos.

The list has three groups (as of 2026-09-14: twelve values):

| Group | Values | Written by |
| --- | --- | --- |
| Proactive triggers | `run_committed`, `missed_usual_day`, `pattern_crossed`, `silence`, `avatar_changed` | `lib/nina/proactive.ts` via `pushNotifier` — **live** |
| Manual test | `manual_test` | `lib/push/actions.ts` (`sendTestPushAction`) — **live** |
| Per-message-write | `chat_reply`, `photo_delivered`, `photo_apology`, `admin_chat_photo`, `worker_photo_delivered`, `worker_photo_apology` | Reserved for phases 2–5 of the plan set — **not yet wired up** (see Status) |

**The two hosts deliberately do not share a kind.** A delivered photograph is written by two
different processes — `lib/nina/imagerun.ts` in the app, and `scripts/nina-image-worker/finish.ts`
on a GitHub runner — and the apology likewise. They get `photo_delivered`/`photo_apology` and
`worker_photo_*` rather than one value each, because the worker only runs when the app's own
invocation was killed: a `worker_*` line in the log is the signal that the off-platform backstop
fired. Collapsing the pairs destroys that signal and leaves nothing in its place. Do not "tidy"
them back together.

#### Types

```ts
export type PushFailureVerdict = 'gone' | 'retry'
export interface PushSubscriptionInput { endpoint: string; p256dh: string; auth: string }
export interface NinaPushPayload {
  v: 1
  title: string
  body: string
  url: string
  tag: string
  messageId: string | null
  kind: string   // a NinaPushKind, typed `string` on purpose
}
```

`NinaPushPayload.kind` is typed `string`, **not** `NinaPushKind`, deliberately: the service worker
reads that field with no type system and may be older than the server pushing to it, so the wire
contract stays "an opaque string". `NinaPushKind` is caller-side discipline, not a wire constraint.
Adding a kind is an addition, so `v` stays `1`.

#### Functions

```ts
export function classifyPushFailure(statusCode: number | null | undefined): PushFailureVerdict
```

**The pruning rule, and the whole of it.** RFC 8030 §7.3: only `404` and `410` are terminal. Every
omission is deliberate — `429` means we were noisy, `5xx` means the push service is having a day,
`401`/`403` is *our* VAPID configuration (pruning on 403 would delete every subscription in the
table because of a typo in an environment variable), `400` is a bug in this code, and no status code
at all is the network.

```ts
export function shouldRevokeSubscription(input: { verdict: PushFailureVerdict; failureCount: number }): boolean
```

The second half of the rule. `failureCount` is the count *before* this failure, so the comparison is
against the incremented value. `lastSuccessAt` is not consulted on purpose. This is the **single**
function in the package that decides whether a subscription is dead — both `recordPushFailure` and
the sender's report call it, which is why the report and the database always agree.

```ts
export function parsePushSubscription(value: unknown): PushSubscriptionInput | null
```

`unknown` in, a flat row or `null` out. No throw — the caller is a Server Action whose honest answer
to a malformed subscription is `{ ok: false }`, not a 500 in the browser console. The `https:`
scheme check lives here: a Server Action is a public HTTP endpoint, and an attacker-supplied
`endpoint` would turn `sendNotification` into a request-forgery primitive.

```ts
export function truncateForNotification(body: string, max?: number): string
export function buildNinaPushPayload(input: { messages: ReadonlyArray<{ id: string; body: string }>; kind: string }): NinaPushPayload | null
export function encodeNinaPushPayload(payload: NinaPushPayload): string
```

`buildNinaPushPayload` takes **only the first non-blank bubble**. The rest are not concatenated: a
notification is a knock on the door, not the conversation, and a four-bubble wall of text on a lock
screen destroys the staggered reveal. Returns `null` for an empty or all-blank turn.

### `send.ts`

#### `notifyNinaPush` — the seam every message writer calls

```ts
export type NinaPushNotifier = (
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: NinaPushKind,
) => Promise<void>

export const notifyNinaPush: NinaPushNotifier
```

**This is the door; `sendNinaPush` is the mechanism.** Any server module may call it, with any of
the twelve kinds, in the same position: the rows are already committed, the notification is a
courtesy, nothing afterwards may depend on it.

*Why not just export `pushNotifier`?* Because `pushNotifier` is declared `satisfies
ProactiveNotifier`, which **infers** its `kind` parameter as `ProactiveTriggerKind` —
`pushNotifier(userId, bubbles, 'chat_reply')` is a compile error. Widening `ProactiveNotifier` to
fix that would mean editing `lib/nina/proactive.ts`, which is already correct and is the pattern the
other writers copy. `notifyNinaPush` takes the wider `NinaPushKind` and leaves that file alone.

*It swallows, and that is not belt-and-braces.* `sendNinaPush` catches the VAPID failure and every
per-subscription failure, but `listLivePushSubscriptions` is a database round trip **outside** its
`try` — a dropped connection rejects straight out of it. Callers are still expected to wrap this in
their own `try` (the way `proactive.ts` does); this `catch` is what makes forgetting survivable.

*Returns `void`, not the report.* A caller that branched on `delivered` would make a message's
success depend on a phone's reachability. The numbers go to the `[push] notified` log line, their
only consumer.

#### `pushNotifier` — the proactive default (unchanged behaviour)

```ts
export const pushNotifier = (async (userId, messages, kind) => { ... }) satisfies ProactiveNotifier
```

`ProactiveDeps.notify`'s default, consumed by `lib/nina/proactive.ts`. `satisfies` rather than an
annotation, so a change to `ProactiveNotifier`'s shape is a compile error *here*, at the seam.

**It still propagates.** Unlike `notifyNinaPush` it has no `catch` of its own — `proactive.ts`
wraps its call site and that is the intended arrangement. Do not "harmonise" the two.

**The subset pin.** One line inside it does real work:

```ts
const pushKind: NinaPushKind = kind
```

`kind` here is `ProactiveTriggerKind`; `NINA_PUSH_KINDS` spells those five names out by hand because
`payload.ts` may not import from `lib/nina/*`. This annotation is what stops the two lists drifting:
add a sixth trigger to `ProactiveTriggerKind` without adding it to `NINA_PUSH_KINDS` and
`npx tsc --noEmit` fails at this line, the only seam that knows about both. It is erased at runtime.

#### `sendNinaPush` — the fan-out

```ts
export async function sendNinaPush(
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: string,
): Promise<PushSendReport>
```

Returns `{ attempted, delivered, pruned, retryable, skipped }`. `skipped` is set (and everything
else zero) when nothing was attempted: no message body, VAPID not configured, or no live
subscriptions — so a log line explains itself.

Sequential, not `Promise.all`: two subscriptions is the realistic maximum, and a rejected promise in
an `all` would abandon the remaining sends *and* their database updates. One subscription's failure
stops nothing. It does not throw for a send failure or a missing VAPID configuration; it *can*
reject if `listLivePushSubscriptions` does.

### `queries.ts`

All `server-only`. **Every function takes `userId` first and scopes on it** — including the ones
keyed by a globally unique `endpoint`, because an unscoped write against a shared table is wrong to
write even when it would be correct (invariant 7).

| Function | Purpose |
| --- | --- |
| `savePushSubscription(userId, input & { userAgent? })` | Upsert on `endpoint`; **re-homes `user_id`**, resets counters, clears `revoked_at` |
| `listLivePushSubscriptions(userId)` | The send fan-out; a list, because phone + laptop is two subscriptions |
| `countLivePushSubscriptions(userId)` | What `PushSetup` renders subscribed/unsubscribed from |
| `deletePushSubscription(userId, endpoint)` | "Turn off" — a hard delete, unconditional |
| `recordPushSuccess(userId, id, at?)` | Clears the failure streak; the streak is about *consecutive* failures |
| `recordPushFailure(userId, id, verdict, failureCount, at?)` | Increments in SQL, revokes via `shouldRevokeSubscription` |

Exports `interface LivePushSubscription { id, endpoint, p256dh, auth, failureCount }`.

**Soft delete for a dead endpoint, hard delete for a human decision.** A 410 sets `revoked_at` and
keeps the row — "which browser stopped answering, and when" is the only forensic trail this feature
has. A runner tapping "Turn off" DELETEs, because keeping a tombstone of an explicit choice would
mean "off" is a state the database still holds an endpoint for.

The revoked rows are why `savePushSubscription` must clear `revoked_at`: a browser can hand back an
endpoint it previously abandoned, the unique index would collide, and a re-subscribe that silently
no-ops is the worst bug available here — the button says "on", the phone stays quiet.

`recordPushFailure`'s `failureCount` is a required fourth parameter rather than a re-read of the
row. **Do not add a default of `0`** — that silently disables the consecutive-failure ceiling.

### `actions.ts`

All three open with `requireUserId()`, and all three return `{ ok, message }` rather than throwing,
because `PushSetupCard` has a real failure state to render and a thrown Server Action gives the
client an opaque digest.

- `subscribeToPushAction({ subscription, userAgent? })` — `subscription` is `unknown` and parsed,
  not annotated; a TypeScript annotation on a wire argument is a comment. Revalidates `/me`.
- `unsubscribeFromPushAction({ endpoint })` — the browser has already called
  `subscription.unsubscribe()` by the time this runs. Revalidates `/me`.
- `sendTestPushAction()` — the "Send me a test" button, and the only reason it exists: the full
  round trip (VAPID signing → push service → worker `push` handler → notification → tap → focus)
  cannot be verified any other way. It goes through `sendNinaPush` rather than a special path, so
  what it proves is the real thing.

## Data Flow

**Subscribe.** `PushSetupCard` → `subscribeToPushAction` → `parsePushSubscription` (https: check,
flatten) → `savePushSubscription` (upsert on endpoint) → `revalidatePath('/me')`.

**Send (proactive).** `lib/nina/proactive.ts` commits message rows → `pushNotifier` →
`sendNinaPush` → `buildNinaPushPayload` (first non-blank bubble, truncated) → `configureVapid()`
(memoised) → `listLivePushSubscriptions` → per subscription: `sendNotification` →
`recordPushSuccess`, or `classifyPushFailure` → `shouldRevokeSubscription` → `recordPushFailure` →
`console.warn` → report.

**Send (any other writer).** Caller commits its rows → `notifyNinaPush(userId, messages, kind)` →
same pipeline, report discarded into the `[push] notified` log line, all throws swallowed.

**Receive.** Push service → `lib/service-worker.js` `push` handler → defensive `event.data.json()`
→ `showNotification(title, { body, tag, renotify, data: { url } })`, plus a `nina:new`
`postMessage` to open clients. Tap → `notificationclick` → focus an open `/nina` or open one.

## Dependencies

### External
- `web-push` (3.6.7, `@types/web-push` 3.6.4) — VAPID JWT signing, RFC 8291 payload encryption, the
  POST. `send.ts` uses the **named** exports (`sendNotification`, `setVapidDetails`,
  `WebPushError`); the type package declares no default and no `export =`, so
  `import webpush from 'web-push'` does not typecheck even with `esModuleInterop`.
- `zod` — `payload.ts`'s subscription schema.
- `drizzle-orm` — `queries.ts`.

### Internal
- `@/lib/env` → `pushEnv()` for `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a
  `mailto:`/`https:` URL `web-push` requires).
- `@/lib/db` + `@/lib/db/schema` → `pushSubscriptions` (declared in `lib/db/schema/push.ts`;
  unique index on `endpoint`, index on `user_id`).
- `@/lib/id` → `newId()`.
- `@/lib/auth/requireUserId` → the Server Actions.
- `@/lib/nina/proactive` → **type-only** import of `ProactiveNotifier`. `proactive.ts` imports
  `pushNotifier` from `send.ts`, so this is a cycle that exists only in the type graph. **Do not
  turn it into a value import** to "tidy" it — that is a real require-cycle between two modules that
  both do work at import time.

### Runtime
**Node runtime, never edge.** `web-push` signs with `node:crypto` and posts with `node:https`;
neither exists on the edge runtime. Every route that can reach `send.ts` must be
`runtime = 'nodejs'`.

## Reverse Dependencies

*Verified 2026-09-14.*

### Primary consumers
- `lib/nina/proactive.ts` — imports `pushNotifier` as `ProactiveDeps.notify`'s default, calls it
  after committing message rows, inside its own `try`.
- `components/push/PushSetupCard.tsx` — all three Server Actions.

### Secondary consumers
- `components/push/PushSetup.tsx` — `countLivePushSubscriptions` only.
- `lib/service-worker.js` — imports nothing (it is referenced as a `new URL(…)` asset and cannot
  import from `lib/`), but keeps its own copies of `PUSH_TARGET_URL` and `PUSH_NOTIFICATION_TAG`
  under a "kept in step" comment. **Changing either constant means editing that file too.**

### Test-only
- `tests/integration/pushQueries.int.test.ts` — dynamic `import('@/lib/push/queries')` against a
  real database.
- `components/push/PushSetup.test.tsx`, `components/push/PushSetupCard.test.tsx` — mock the query
  and action modules.

### Reserved, not yet wired (phases 2–5)
`lib/nina` (chat turn, `imagerun.ts`), `lib/admin` (chat photo) and `scripts/nina-image-worker`
will call `notifyNinaPush`. None of them import this package yet.

## Concurrency

Not concurrent by design; everything is `async` I/O with no shared mutable state except one flag.

- `configureVapid()` memoises `setVapidDetails` in a module-level `vapidConfigured` boolean, because
  `setVapidDetails` mutates module state in `web-push`. The double-set race is benign (same values).
- The fan-out loop is strictly sequential and `await`s each subscription.
- `recordPushFailure` increments `failure_count` **in SQL**, so two concurrent sends cannot both
  write `1`. The `shouldRevokeSubscription` check still uses the count the caller holds, which can
  be one behind under a race — the consequence is revocation on the sixth failure instead of the
  fifth, which is an accepted amount of wrong for a personal app and is cheaper than a transaction.

## Error Handling

No custom error types and no sentinel errors. The package's entire error posture is a ladder:

| Layer | On failure |
| --- | --- |
| `parsePushSubscription` | returns `null` |
| Server Actions | return `{ ok: false, message }` — copy the card renders verbatim, never a stack trace |
| `sendPushToSubscription` | swallows, classifies, records, `console.warn('[push] send failed')` |
| `sendNinaPush` | per-subscription bookkeeping failures counted as `retryable`; VAPID failure returns `skipped`; **can still reject from `listLivePushSubscriptions`** |
| `notifyNinaPush` | swallows everything, `console.warn('[push] notify failed')` |
| `pushNotifier` | **propagates** — `proactive.ts` owns the `try` |

Nothing here panics or rethrows a send error. `WebPushError` is the only typed catch:
`cause instanceof WebPushError ? cause.statusCode : null`, and a `null` reads as retryable.

Log lines reduce the endpoint to its host (`hostOf`), because an endpoint is ~300 characters of
which the host is the only informative part.

## Performance

Light allocation; the cost is entirely network and database.

- One `sendNotification` per live subscription per turn (realistically one or two), each an HTTPS
  POST with ECDH + HKDF + AES-GCM encryption.
- One `SELECT` per send (through `push_subscriptions_user_idx`) plus one `UPDATE` per subscription.
- `PUSH_TTL_SECONDS` is three hours, deliberately short: Nina's messages are about right now, and
  one that surfaces the following afternoon is not late, it is wrong. The message itself is never
  lost — it is a row in `nina_messages` with the unread dot still on the tab.
- Sends go out with `urgency: 'normal'` and `topic: payload.tag`, and every Nina notification shares
  the tag `nina` so a second one **replaces** the first in the tray instead of stacking.

## Testing

`vitest` with `environment: 'node'` and no jsdom, so `self`, `navigator` and `PushSubscription` do
not exist in a test. What is testable — and what is tested — is the shape of the message, the parse
of the subscription, the decision to give up on an endpoint, and the notifier seams.

- `payload.test.ts` — failure classification (including "a rotated VAPID key must not delete every
  subscription: 403 is retryable"), the revoke threshold at exactly five, subscription parsing and
  the `https:` rejection, truncation including the no-spaces case, first-non-blank-bubble selection,
  and the kind vocabulary (every trigger present, the two hosts distinct, no duplicates).
- `send.test.ts` — `notifyNinaPush` takes a kind the proactive union does not have, swallows a
  rejected subscription read, and reports "nothing attempted"; `pushNotifier` is unchanged and
  **still propagates**; `sendNinaPush` still fans out.
- `tests/integration/pushQueries.int.test.ts` — the query layer against a real database.

## Gotchas

- **Do not add `server-only`, an `@/` import, or any I/O to `payload.ts`.** The off-platform worker
  imports it by relative path under `node --experimental-strip-types`.
- **Do not make the `ProactiveNotifier` import in `send.ts` a value import.** It is a genuine
  require-cycle otherwise.
- **Do not give `pushNotifier` a `catch`** to match `notifyNinaPush`. `proactive.ts` owns that `try`,
  and a test pins the propagation.
- **Do not delete the `const pushKind: NinaPushKind = kind` line in `pushNotifier`.** It looks inert;
  it is the only compile-time link between `ProactiveTriggerKind` and `NINA_PUSH_KINDS`.
- **Do not merge `photo_delivered` with `worker_photo_delivered`** (or the apology pair). The split
  is the only signal that the off-platform backstop fired.
- **Do not add a default of `0` to `recordPushFailure`'s `failureCount`.** It disables the ceiling.
- **Do not prune on 401/403.** That is our VAPID configuration, and a typo in an env var would empty
  the table.
- **Changing `PUSH_TARGET_URL` or `PUSH_NOTIFICATION_TAG` means editing `lib/service-worker.js`**,
  which holds unchecked copies of both.
- **Changing a payload field's *meaning* means bumping `v` and branching in the worker.** Adding a
  field, or a kind, does not. A registered worker outlives the deploy that shipped it.
- `lib/db/schema/push.ts` names the row type `PushSubscriptionRow`, not `PushSubscription` —
  the latter is a DOM global the client code uses by that exact name.

## Status

*As of 2026-09-14.* Phase 1 of the `NINA_PUSH_EVERY_MESSAGE_PLAN.md` set (task `P1-PSH-A000`) is
complete: `NINA_PUSH_KINDS` / `NinaPushKind` and `notifyNinaPush` exist and are tested. Phases 2–5,
which make `lib/nina`, `lib/admin` and `scripts/nina-image-worker` actually call `notifyNinaPush`
with the six per-message-write kinds, are **not implemented**. Those six values are currently
declared and unused outside this package's own tests — that is expected, not dead code.

## Notes

Phase 1 added no dependency, no DDL, and no wire-format change: `NinaPushPayload.v` stays `1`.
`pushNotifier`'s runtime behaviour is byte-for-byte what it was — the only addition inside it is a
type annotation that the compiler erases.

## Recent Changes

**2026-09-14 — `P1-PSH-A000` (phase 1 of 5)**
- `payload.ts`: added `NINA_PUSH_KINDS` (twelve values) and the `NinaPushKind` type, with the
  rationale for living in this module rather than `send.ts`.
- `send.ts`: added `NinaPushNotifier` and `notifyNinaPush` — caller-facing, never-throwing, accepts
  the full vocabulary. Added the `const pushKind: NinaPushKind = kind` subset pin inside
  `pushNotifier`, which is otherwise unchanged.
- `payload.test.ts` extended; `send.test.ts` added.
