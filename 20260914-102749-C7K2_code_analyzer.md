# Code Analysis: Nina push notifications on every message she sends

**Type:** Feature Update
**Date:** 2026-09-14 10:27:49 WIB
**Session ID:** 20260914-102749-C7K2
**Plan:** `NINA_PUSH_EVERY_MESSAGE_PLAN.md` (5 phases)
**Worktree:** `/home/miftah/.worktrees/run-insights/nina-push-every-message` — branch `feature/nina-push-every-message`, base `origin/main` @ `0c53636`

---

## User Input

### Original User Request

```
make sure, everytime nina sends a message, whether it is her own initiatives or responding to
user's message, if user enable notification, it always sends a push notification to my xs max
```

### User-Provided Context

None beyond the prose. "my xs max" names the target device: an iPhone XS Max, which reaches
Web Push only as an installed (Add to Home Screen) PWA — the constraint `lib/push/payload.ts`
already writes into its own comments ("iOS shows roughly four lines on a locked XS Max").

### User-Provided Files

None marked with `@`. The target and the type were inferred.

### Requirement IDs

| ID | What the user asked for |
|---|---|
| R1 | When Nina answers something the runner said, a push notification is sent |
| R2 | When Nina speaks on her own initiative, a push notification is sent |

The "if user enable notification" clause and "it always sends" are not separate deliverables —
they are the gate and the strength of the guarantee, and they are carried as plan invariants
(see `## Invariants` in the plan index) rather than as their own R.

---

## Detailed Requirements Understanding

**Problem/Requirement Statement**

The Web Push feature (F33 phase 11) is fully built and working — table, VAPID, Server Actions,
service worker, sender, pruning, the `/me` card and its test button. It is wired into exactly
**one** of the five places in this codebase that write a `nina_messages` row with
`role: 'nina'`: the proactive emitter. Every other message Nina sends reaches the phone only if
the runner happens to have the app open (the service worker's `postMessage` → `router.refresh()`
path, which requires a push to have arrived in the first place) or opens `/nina` himself.

The four uncovered writes are:

| Write site | What she is saying | R |
|---|---|---|
| `lib/nina/turnrun.ts:446` | **her reply to his message** — every chat turn, including resends, revives and burst-chained follow-ups | R1 |
| `lib/nina/imagerun.ts:352` | the photograph he asked for, with its caption (in-platform host) | R1 |
| `lib/nina/imagejobs.ts:620` | R22's apology when the photograph he asked for could not be made | R1 |
| `lib/admin/chatPhotoActions.ts:303` | a photo she posts into the chat, pushed from `/admin` | R2 |
| `scripts/nina-image-worker/finish.ts:142` | the photograph he asked for (off-platform backstop host) | R1 |

The first of these is by far the most consequential. `runNinaBackgroundTurn` is the
*nina-offline-reply* design: the Server Action returns before the model is called, and the reply
lands 13–45 s later in `after()`. **That design exists precisely so the runner can put the phone
down** — and it is the one path with no way to tell him the reply arrived.

**Success Criteria**

1. Send Nina a message on the XS Max, lock the phone. When her reply is written, the phone buzzes
   with her first bubble.
2. Ask her for a photo, lock the phone. When the photo lands — or when she apologises for not
   managing it — the phone buzzes.
3. A proactive message still buzzes exactly as it does today (no regression).
4. With notifications turned off (no live `push_subscriptions` row), nothing is sent and nothing
   in any of those paths behaves differently.
5. A push failure — no VAPID, a dead endpoint, a network fault — never fails, delays or
   duplicates the message write it accompanies.

**Key Considerations**

- **"Enabled" has exactly one meaning in this codebase**: `countLivePushSubscriptions(userId) > 0`,
  i.e. at least one `push_subscriptions` row for this user with `revoked_at IS NULL`. There is no
  separate preference flag, and none is needed — `sendNinaPush` already returns
  `skipped: 'no live subscriptions'` before attempting anything. **No new column, no new toggle.**
- **"Always" means no foreground suppression.** The request says it always sends. It is also what
  the platform requires: `lib/service-worker.js`'s own comment records that on iOS a `push`
  handler resolving without `showNotification` is a policy violation counted against the app's
  push budget. Suppressing on the server would not avoid that; it would just mean no push at all.
- **The tray already collapses a burst.** `PUSH_NOTIFICATION_TAG = 'nina'` is one constant tag for
  every Nina notification, with `renotify: true` in the worker, so a reply notification replaces a
  proactive one in the tray and still buzzes. Four bubbles are one notification by construction —
  `buildNinaPushPayload` takes the first non-blank body and drops the rest.
- **Never on a critical path.** Every new call site is already past its own commit: `turnrun.ts`'s
  notify would follow the `INSERT` and the claim close; `imagerun.ts`'s would follow its row;
  the admin action's would follow its own. All five are inside `after()` or a background host.
- **`sendNinaPush` needs no behavioural change.** It already takes `kind: string`, already fans
  out, prunes and reports. What it lacks is a caller-facing entry point not typed to
  `ProactiveTriggerKind` — `pushNotifier` is `satisfies ProactiveNotifier`, so its `kind`
  parameter is inferred as that union and a `'chat_reply'` argument would not typecheck.
- **`sendNinaPush` CAN reject, and every caller must wrap it.** `await
  listLivePushSubscriptions(userId)` (`lib/push/send.ts:164`) sits **outside** the function's
  `try`, so a database fault there propagates. Measured during phase 1's planning by driving the
  real module with `./queries` mocked to reject. The VAPID and per-subscription send failures are
  caught and reported as `skipped`/`retryable`, which is what makes "no keys" and "a dead endpoint"
  normal outcomes — but "the database was unreachable" is not among them. This is why plan
  invariant 2 asks each call site for its own `try` rather than trusting the sender's.
- **The off-platform worker is a different world.** `scripts/nina-image-worker/*.ts` runs under
  `node --experimental-strip-types` in GitHub Actions with `npm ci --omit=dev`, and its stated
  module rules forbid `@/` aliases and `server-only`. It therefore cannot import
  `lib/push/send.ts`. It *can* import `lib/push/payload.ts` (no `server-only`) and it *can*
  `createRequire('web-push')`, because `web-push` is a runtime dependency and is installed by
  `--omit=dev`. What it cannot do by itself is acquire the VAPID keys: those are three GitHub
  repository secrets a human must add.

**Assumptions**

- **A1.** "Enabled" = a live subscription row. No new preference surface is built. (`/me`'s
  `PushSetup` already reads exactly this.)
- **A2.** No foreground/active-session suppression. The word in the request is "always".
- **A3.** The admin-inserted chat photo (`lib/admin/chatPhotoActions.ts`) counts as Nina sending a
  message and therefore pushes. It is the runner's own action from another device, so this is the
  one call site where a reasonable person could want the opposite; it is recorded as a Decision
  and is a one-commit revert.
- **A4.** The off-platform worker's push degrades to "skipped" when `VAPID_*` is absent from the
  Actions environment, exactly as the app degrades on a deployment with no keys. The code lands
  either way; the secrets are an ops step named in the plan.

---

## Analysis Scope

### Explicitly Mentioned Files

None.

### Discovered Related Files

**The push feature, complete as shipped (F33 phase 11):**

- `lib/db/schema/push.ts` — `push_subscriptions`; declaration only, phase 11 owns every write
- `lib/push/payload.ts` — wire format, truncation, subscription parsing, the pruning rule. No
  `server-only`, no I/O, no browser API — deliberately importable from anywhere
- `lib/push/queries.ts` — the table's whole read/write surface; every function `userId`-first
- `lib/push/send.ts` — the one place this app talks to a push service; `sendNinaPush` +
  `pushNotifier`
- `lib/push/actions.ts` — `subscribeToPushAction`, `unsubscribeFromPushAction`,
  `sendTestPushAction`
- `lib/service-worker.js` — `push` and `notificationclick`; bundled, not `public/sw.js`
- `components/push/PushSetup.tsx` / `PushSetupCard.tsx` — the `/me` card
- `lib/push/payload.test.ts`, `components/push/PushSetup*.test.tsx`,
  `tests/integration/pushQueries.int.test.ts`

**The message writers:**

- `lib/nina/proactive.ts` — the one wired caller (`emitProactiveMessage`, line 653 insert,
  line 620 `const notify = deps.notify ?? pushNotifier`)
- `lib/nina/turnrun.ts` — `runNinaBackgroundTurn`, the reactive turn and its chain
- `lib/nina/actions/send.ts` — `sendNinaMessage`; schedules the turn at line 927
- `lib/nina/actions/resend.ts` — same turn, re-scheduled after a failure (line 237)
- `lib/nina/turnrevive.ts` — same turn, scheduled from a Server Component render (line 249)
- `lib/nina/actions/startTurn.ts` — the `after()` seam all three share
- `lib/nina/imagerun.ts` — `finishSelfie` in-platform
- `lib/nina/imagejobs.ts` — `postNinaApologyMessage`, `failNinaImageJob`, `sweepStaleNinaImageJobs`
- `lib/admin/chatPhotoActions.ts` — the admin chat-photo add
- `scripts/nina-image-worker/finish.ts` — `finishSelfie` off-platform
- `.github/workflows/nina-image.yml` — that worker's host and env

**Supporting:**

- `lib/nina/queries/messages.ts` — `insertNinaMessages` (returns `[]`, never throws, for a session
  that is not this user's)
- `lib/nina/chatturn.ts` — `openNinaChatTurn` / `closeNinaChatTurn` / `chatTurnWasSuperseded`
- `lib/env.ts` — `pushEnv()`, lazy and throwing
- `lib/nina/live.ts` — `SW_MESSAGE_TYPE = 'nina:new'`, the worker↔`ChatScreen` contract
- `components/nina/ChatScreen.tsx:407` — turns that message into `router.refresh()`

---

## Current Dataflow

### Entry Point A — the reactive turn (R1, uncovered)

**Location:** `lib/nina/actions/send.ts` → `sendNinaMessage` (Server Action)
**Trigger:** the runner taps send in `/nina`
**Input:** text, image attachments, an optional quoted row, an optional attached run

1. His message is persisted (`insertNinaMessages`, `lib/nina/actions/send.ts:612`) and the action
   **returns immediately** — `{ ok, userMessageId, sessionId, cursor, turnId }`. Nothing waits for
   the model.
2. A claim row is opened (`openNinaChatTurn`, `chatturn.ts`). `null` means a turn is already in
   flight for this conversation, and this message will be picked up by that turn's chain.
3. `startNinaBackgroundTurn` (`lib/nina/actions/startTurn.ts`) hands `runNinaBackgroundTurn` to
   `after()`. Budget: `NINA_BACKGROUND_BUDGET_MS` (240 s), paired with `app/nina/page.tsx`'s
   `maxDuration = 300`.
4. `runNinaBackgroundTurn` (`lib/nina/turnrun.ts`) loads context and tuning, calls `runNinaTurn`
   (13–45 s), then:
   - re-checks supersession → discards and exits, writing nothing
   - re-checks the session still exists → abandons, writing nothing
   - `result.payload == null` → closes the turn, distills, writes **no bubble**
   - **otherwise: `insertNinaMessages(userId, bubbles, sessionId)` at line 446** ← her reply
   - `closeNinaChatTurn` — and the poll's two questions both flip only here
   - `runNinaDistillation`, then `titleNinaSessionIfNeeded`
5. **The chain** (lines 538–586): if the newest row in the session is his again — a burst — a
   fresh claim opens and `runNinaBackgroundTurn` **recurses**, bounded by `NINA_TURN_CHAIN_MAX`
   and by wall clock. Its bubbles land at the *same* line 446.

**Exit points today:** the `nina_messages` rows; the closed claim row; `nina_memory_*`; the
session title. **No notification is sent.** The runner learns about the reply from
`lib/nina/actions/poll.ts` if the screen is open, and otherwise from nothing at all.

**Where a notify belongs:** immediately after the claim is closed at `turnrun.ts` line ~467 —
after the rows are committed and the poll can see them, before the distillation's 10–20 s model
call. One site covers send, resend, revive **and** every chained link, because all four converge
on this function.

### Entry Point B — the proactive turn (R2, covered)

**Location:** `lib/nina/proactive.ts` → `emitProactiveMessage`
**Triggers:** `evaluateAndEmitForUser` (from `app/api/cron/nina/route.ts`) and `emitRunCommitted`
(from `lib/review/actions.ts`'s `after()`)

Order of operations, documented in that function's own header: build the instruction → run the
turn → `insertNinaMessages` (line 653) → write the durable idempotence marker → **notify**
(line 613: `await notify(userId, bubbles, detail.kind)`, in its own `try`, warning on failure).

`notify` defaults to `pushNotifier` and is overridable through `ProactiveDeps.notify`, which is
what `tests/nina.proactive.test.ts` drives. **This is the pattern the four uncovered sites should
copy**, down to the swallowed failure.

### Entry Point C — the photograph, in-platform (R1, uncovered)

**Location:** `lib/nina/imagerun.ts` → `finishSelfie`
**Trigger:** `runNinaImageJob` inside `after()`, ~78 s after `generate_image` was called

Generates → stores to Blob (hash-deduped) → captions (`captionNinaPhoto`, 4–8 s) →
`insertNinaMessages` at line 352 with `photoOnly: true` → `insertNinaMessageImages` → a second,
post-insert dedupe re-check. **No notification.** The runner asked for a photo ninety seconds ago
and has certainly locked his phone.

### Entry Point D — the apology (R1, uncovered)

**Location:** `lib/nina/imagejobs.ts` → `postNinaApologyMessage`, line 620
**Callers:** `failNinaImageJob` (a job that gave up) and `sweepStaleNinaImageJobs` (a `pending`
row older than `NINA_IMAGE_STALE_MS` = 20 min, swept on every `/nina` render)

One row, her words, no error code. The session is resolved from the runner message that asked.
**No notification.** Twenty minutes is a long time to be waiting for a photo that is not coming.

### Entry Point E — the admin chat photo (R2, uncovered)

**Location:** `lib/admin/chatPhotoActions.ts`, line 303
**Trigger:** the runner adds a photo to Nina's chat from `/admin`

Resolves the write session, inserts one `photoOnly` bubble with a pooled caption, then the image
row. That file's own comment at line 780 says the bubble is expected to arrive by
"service-worker refresh" — **which only happens when a push arrives**, so today it arrives on the
next page load.

### Entry Point F — the photograph, off-platform (R1, uncovered)

**Location:** `scripts/nina-image-worker/finish.ts`, raw SQL insert at line 142
**Host:** GitHub Actions, `.github/workflows/nina-image.yml`, `npm ci --omit=dev`

The backstop for a job whose Vercel invocation was killed, plus the manual drain. Its `env:` block
carries `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN` and `OPENROUTER_API_KEY` — **no `VAPID_*`**.

### Data Persistence

**Database:** `push_subscriptions` — insert/upsert on `endpoint`, `last_success_at` /
`failure_count` / `last_failure_at` / `revoked_at` on each send. `nina_messages` — the rows every
site above writes.

**No cache.** `vapidConfigured` is a module-level memo of `setVapidDetails`, reset per lambda.

### Exit Points

`web-push`'s `sendNotification` → the push service (Apple for the XS Max) → the registered service
worker's `push` handler → `showNotification` **and** a `postMessage({type:'nina:new'})` to every
open window, which `ChatScreen` turns into `router.refresh()`.

---

## Key Data Structures

### `NinaPushPayload` — `lib/push/payload.ts:148`

```ts
interface NinaPushPayload {
  v: 1
  title: string        // always 'Nina'
  body: string         // first non-blank bubble, truncated to 180 chars on a word boundary
  url: string          // '/nina'
  tag: string          // 'nina' — one tag, so a second notification replaces the first
  messageId: string | null
  kind: string         // diagnostics only
}
```

Used in: `buildNinaPushPayload`, `encodeNinaPushPayload`, `sendPushToSubscription`, and read
defensively by `lib/service-worker.js` (which cannot be typechecked against it).

### `PushSendReport` — `lib/push/send.ts:66`

`{ attempted, delivered, pruned, retryable, skipped }`. `skipped` is a string reason and is the
mechanism by which "notifications are off" is a normal outcome rather than an error.

### `ProactiveNotifier` — `lib/nina/proactive.ts:481`

```ts
type ProactiveNotifier = (
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: ProactiveTriggerKind,
) => Promise<void>
```

`kind` is narrowed to the trigger union. `pushNotifier` is declared `satisfies ProactiveNotifier`,
so **its inferred `kind` parameter is `ProactiveTriggerKind`** — this is the single type-level
reason the reactive path cannot simply `import { pushNotifier }` and call it with `'chat_reply'`.

### `LivePushSubscription` — `lib/push/queries.ts:48`

`{ id, endpoint, p256dh, auth, failureCount }`. A list, because a phone and a laptop are two rows.

### `SentBubble` — `lib/nina/turnrun.ts:64`

`{ id, body, replyToId }` — the reactive turn's in-hand bubble shape. Structurally assignable to
`sendNinaPush`'s `ReadonlyArray<{ id: string; body: string }>` with no mapping.

---

## Dependencies

### Configuration / Environment

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — read lazily through `pushEnv()`
(`lib/env.ts:236`), which **throws** when the group is unset. Every current consumer catches it:
`PushSetup` renders a fallback, `sendNinaPush` returns `skipped`. Memory note
`vercel-preview-cannot-serve-admin` records that `VAPID_*` is **Production-scope only** on Vercel,
so a preview deployment cannot send a push at all — verification has to be a production deploy or
a local production build.

### External Services

Apple Push Notification service, reached through `web-push`'s VAPID-signed RFC 8291 POST.
**Node runtime only** — `next.config.ts:4` records that every route in this app already is.

### Runtime constraints

- `web-push` is a **runtime** dependency (`package.json` `dependencies`), so it survives
  `npm ci --omit=dev` in the Actions workflow. `@types/web-push` is a devDependency, which is fine
  — CI's typecheck installs devDependencies.
- `scripts/nina-image-worker/*` module rules: `.ts`-suffixed relative imports, no `@/` aliases, no
  `server-only`, CJS packages through `createRequire`.
- The worktree needs `.env.local` **and** a real `npm install` before any gate runs
  (`lib/env.ts` validates 14 vars at load; a `node_modules` symlink passes vitest+tsc but
  Turbopack's build rejects it). Both are already done in this worktree.

---

## Reference List

Every site that touches "Nina emits a message" or "a push is sent".

| Symbol / key | File:line | Kind | Package |
|---|---|---|---|
| `sendNinaPush` | `lib/push/send.ts:150` | def | `lib/push` |
| `pushNotifier` | `lib/push/send.ts:205` | def (`satisfies ProactiveNotifier`) | `lib/push` |
| `sendPushToSubscription` | `lib/push/send.ts:93` | def (private) | `lib/push` |
| `PUSH_TTL_SECONDS` | `lib/push/send.ts:49` | const | `lib/push` |
| `buildNinaPushPayload` | `lib/push/payload.ts:224` | def | `lib/push` |
| `encodeNinaPushPayload` | `lib/push/payload.ts:243` | def | `lib/push` |
| `truncateForNotification` | `lib/push/payload.ts:207` | def | `lib/push` |
| `NinaPushPayload` | `lib/push/payload.ts:148` | type | `lib/push` |
| `PUSH_NOTIFICATION_TAG` | `lib/push/payload.ts:37` | const | `lib/push` |
| `listLivePushSubscriptions` | `lib/push/queries.ts:113` | def | `lib/push` |
| `countLivePushSubscriptions` | `lib/push/queries.ts:128` | def — the "enabled?" read | `lib/push` |
| `sendTestPushAction` | `lib/push/actions.ts:92` | call of `sendNinaPush` | `lib/push` |
| `pushEnv` | `lib/env.ts:236` | def | `lib` |
| `push` handler | `lib/service-worker.js:81` | impl | `lib` |
| `emitProactiveMessage` | `lib/nina/proactive.ts:604` | **the only wired call** (line 613) | `lib/nina` |
| `ProactiveNotifier` | `lib/nina/proactive.ts:481` | type | `lib/nina` |
| `ProactiveDeps.notify` | `lib/nina/proactive.ts:489` | seam | `lib/nina` |
| `NOOP_NOTIFIER` | `lib/nina/proactive.ts` | test double, still exported | `lib/nina` |
| `evaluateAndEmitForUser` | `lib/nina/proactive.ts:783` | call | `lib/nina` |
| `emitRunCommitted` | `lib/nina/proactive.ts:729` | call | `lib/nina` |
| **`runNinaBackgroundTurn`** | **`lib/nina/turnrun.ts` (insert at 446)** | **gap — R1** | `lib/nina` |
| the chain | `lib/nina/turnrun.ts:538–586` | recursion into the same insert | `lib/nina` |
| `startNinaBackgroundTurn` | `lib/nina/actions/startTurn.ts` | `after()` seam | `lib/nina` |
| `sendNinaMessage` | `lib/nina/actions/send.ts:927` | schedules the turn | `lib/nina` |
| `resendNinaTurn` | `lib/nina/actions/resend.ts:237` | schedules the turn | `lib/nina` |
| `reviveNinaChatTurn` | `lib/nina/turnrevive.ts:249` | schedules the turn | `lib/nina` |
| **`finishSelfie`** | **`lib/nina/imagerun.ts:352`** | **gap — R1** | `lib/nina` |
| **`postNinaApologyMessage`** | **`lib/nina/imagejobs.ts:620`** | **gap — R1** | `lib/nina` |
| `failNinaImageJob` | `lib/nina/imagejobs.ts:575` | caller of the apology | `lib/nina` |
| `sweepStaleNinaImageJobs` | `lib/nina/imagejobs.ts:657` | caller of the apology | `lib/nina` |
| **admin chat-photo add** | **`lib/admin/chatPhotoActions.ts:303`** | **gap — R2** | `lib/admin` |
| **`finishSelfie` (worker)** | **`scripts/nina-image-worker/finish.ts:142`** | **gap — R1, other host** | `scripts` |
| **`closeFailed` (worker)** | **`scripts/nina-image-worker/finish.ts:299`** | **gap — R1, other host; the apology's off-platform twin** | `scripts` |
| worker `env:` block | `.github/workflows/nina-image.yml:93–96` | config — no `VAPID_*` | `.github` |
| `insertNinaMessages` | `lib/nina/queries/messages.ts:205` | def; returns `[]` for a foreign session | `lib/nina` |
| `SW_MESSAGE_TYPE` | `lib/nina/live.ts:27` | const, pairs with the worker | `lib/nina` |
| `nina:new` handler | `components/nina/ChatScreen.tsx:407` | impl | `components/nina` |
| `pushSubscriptions` | `lib/db/schema/push.ts:17` | table | `lib/db` |
| `tests/nina.proactive.test.ts` | — | test (drives `deps.notify`) | `tests` |
| `lib/push/payload.test.ts` | — | test | `lib/push` |
| `tests/integration/pushQueries.int.test.ts` | — | integration test | `tests` |

---

## Impact Points (files that WILL need changes)

1. **`lib/push/send.ts`** — a caller-facing notifier whose `kind` is not narrowed to
   `ProactiveTriggerKind`, and a kind vocabulary. Owned by **phase 1**.
2. **`lib/push/payload.ts`** — the kind union lives beside the payload it is stamped onto; no
   `server-only`, so the off-platform worker can import it. Owned by **phase 1**.
3. **`lib/nina/turnrun.ts`** — notify after the bubbles commit and the claim closes; a `deps`-style
   seam so it is testable without VAPID. Owned by **phase 2**. *R1's whole substance.*
4. **`lib/nina/imagerun.ts`** — notify after the photo's message row and image row land. Owned by
   **phase 3**.
5. **`lib/nina/imagejobs.ts`** — notify after the apology row lands. Owned by **phase 3**.
6. **`lib/admin/chatPhotoActions.ts`** — notify after the photo bubble lands. Owned by
   **phase 4**.
7. **`scripts/nina-image-worker/finish.ts`** (and a small sibling module for the send) — the
   off-platform push, under that directory's module rules. **Two** call sites, not one:
   `finishSelfie`'s delivered photograph (line 142) and `closeFailed`'s apology (line 299). The
   second was missed by this document's first pass and found by phase 5's planner; it is the last
   uncovered `nina_messages` write in the set, and leaving it out would fail R1's "everytime" on
   the one host the runner cannot observe. Owned by **phase 5**.
8. **`.github/workflows/nina-image.yml`** — three `VAPID_*` lines in the `env:` block. Owned by
   **phase 5**. *Requires three GitHub repository secrets, which only the repository owner can
   add; the code degrades to "skipped" until then.*
9. **Tests** — one per phase, alongside the existing `tests/nina.*` conventions. Each phase owns
   its own.

**Not changed, and why:**

- `lib/nina/proactive.ts` — already correct. Phases 1–5 must leave its behaviour byte-identical.
- `lib/db/schema/push.ts` and any migration — "enabled" is already expressible; no DDL.
- `lib/service-worker.js` — the payload shape does not change, so `v` stays `1`. A registered
  worker from last week keeps working.
- `components/push/*`, `app/me/page.tsx` — the enablement UI is unchanged.
- `lib/nina/actions/send.ts`, `resend.ts`, `turnrevive.ts`, `startTurn.ts` — all three converge on
  `runNinaBackgroundTurn`, so phase 2's one site covers them. Touching them would be duplicate work.

**This document describes. The plan files prescribe.**
