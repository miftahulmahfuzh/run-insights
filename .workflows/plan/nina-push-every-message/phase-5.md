# Phase 5: Push from the off-platform backstop worker

**Plan set:** `NINA_PUSH_EVERY_MESSAGE_PLAN.md`
**Analysis:** `20260914-102749-C7K2_code_analyzer.md`
**Satisfies:** R1 — *when Nina answers something the runner said, a push notification is sent*. The
photograph he asked for is an answer to something he said, and so is the apology when it cannot be
made; this phase covers **both** writes on the host that takes over when Vercel's invocation was
killed. The apology half was assigned here by the reconciler — see Step 2f.
**Depends on:** Phase 1 (`lib/push/payload.ts`'s `NinaPushKind`, and the two members
`'worker_photo_delivered'` and `'worker_photo_apology'` — **and nothing else from phase 1**; this
phase cannot import `lib/push/send.ts`)
**Difficulty:** HARD
**Package:** `scripts/nina-image-worker`

---

## Goal

After this phase a photograph finished by the GitHub Actions backstop buzzes the phone with the same
caption it wrote into the chat — and so does the apology it writes when it gives that photograph up.
Both carry a `NinaPushKind` of this host's own (`'worker_photo_delivered'`, `'worker_photo_apology'`),
deliberately distinct from the in-platform twin's, because `kind` is diagnostics only and "the
backstop fired" is the diagnostic worth having. The
worker gets its own sender — the app's `lib/push/send.ts` is unreachable from a host that cannot
resolve `@/` or tolerate `server-only` — which imports every *judgement* from `lib/push/payload.ts`
and restates only the *plumbing*: four statements against `push_subscriptions` and one `web-push`
call through `createRequire`. Nothing it does can cost a photograph: with no `VAPID_*` in the Actions
environment the push is a logged `skipped` and the job still closes `ok`.

---

## Interface Contract

The reconciler reads this section to detect cross-phase conflicts. Be exact and exhaustive.

**Deletes:** none.

**Renames:** none.

**Creates:**

- `scripts/nina-image-worker/push.ts` (new file) exporting:
  - `sendWorkerPush(sql, userId, messages, kind, sendFn?)` -> `Promise<WorkerPushReport>`
  - `interface WorkerPushReport` — `{ attempted, delivered, pruned, retryable, skipped }`
  - `type WorkerNotifier` — the seam `finishSelfie` **and `closeFailed`** take their notifier through
  - `type SendWorkerNotification` — the `web-push` `sendNotification` shape, hand-written
- **Not re-exported from the barrel `scripts/nina-image-worker.ts`.** That file's header states its
  rule verbatim: *"the barrel's surface is exactly what the single file used to export"*, which is
  why `finishAvatar` is exported by `finish.ts` and deliberately absent from the barrel. `push.ts`
  is the same case. **The barrel is not edited by this phase at all** — the test imports the new
  module by its own path.

**Signature changes:**

- `finishSelfie(sql, job, image, result)` -> `finishSelfie(sql, job, image, result, notify?)`.
  **Additive with a default**, so `run.ts:79`'s four-argument call is unchanged and `run.ts` is not
  edited. The precedent is `releaseBlobIfUnreferenced(sql, userId, ref, delFn = del)`
  (`cleanup.ts:31–37`) and the reason is identical: the real implementation arrives through
  `createRequire`, which no `vi.mock` registry reaches.
- `closeFailed(sql, job, outcome)` -> `closeFailed(sql, job, outcome, notify?)` — **the same
  additive, defaulted seam, for the same reason.** `run.ts`'s three calls are positional and
  three-argument (`run.ts:51`, `:66`, `:91`) and keep compiling untouched — **`run.ts` is not
  edited by this phase**, exactly as it is not edited for `finishSelfie`'s fifth parameter — and
  `tests/nina.imageworker.test.ts`'s existing three-argument cases likewise. Assigned to this phase
  by the reconciler; see Step 2f.

**Requires (from earlier phases) — SETTLED against `phase-1.md`, not assumed:**

| What this phase needs | Name | From |
|---|---|---|
| the kind vocabulary type | `NinaPushKind` | `lib/push/payload.ts` |
| the delivered photograph's kind | **`'worker_photo_delivered'`** | a member of `NinaPushKind` |
| the apology's kind | **`'worker_photo_apology'`** | a member of `NinaPushKind` |
| the wire format | `buildNinaPushPayload`, `encodeNinaPushPayload` | `lib/push/payload.ts` |
| the pruning verdict | `classifyPushFailure` | `lib/push/payload.ts` |
| the revocation threshold | `shouldRevokeSubscription` | `lib/push/payload.ts` |

The last three are exported by `payload.ts` today and need no phase-1 change. The first three are
phase 1's, read off its Interface Contract.

**THE TWO HOSTS DO NOT SHARE A KIND, AND THAT IS THE POINT.** Phase 3 stamps `'photo_delivered'`
and `'photo_apology'` for the same two events in the app; this phase stamps `'worker_photo_delivered'`
and `'worker_photo_apology'`. `NinaPushPayload.kind` is documented as **diagnostics only**, and
"which host delivered this photograph" is exactly the diagnostic this backstop exists to produce:
it runs only when the app's own invocation was killed, so a `worker_*` value in a log line is the
one signal that says the backstop fired. Collapsing the two pairs into one value each would destroy
that signal and leave nothing in its place. **Do not "tidy" these literals to match phase 3's, or
the reverse.** See *Where this matches phase 3* below for the full comparison.

**This phase does NOT require `notifyNinaPush`** — the caller-facing notifier phases 2, 3 and 4
import from `lib/push/send.ts`. It cannot: that file opens `import 'server-only'` and reaches
`@/lib/env` and `@/lib/push/queries`. A reconciler renaming `notifyNinaPush` must **not** touch this
phase's files.

**Requires of phase 1, negatively — plan invariant 8:** `lib/push/payload.ts` must keep its freedom
from `server-only` and from I/O. **Measured on the tree as it stands**, so phase 1 only has to not
break it:

```
$ node --experimental-strip-types --no-warnings --input-type=module \
    -e "import * as p from './lib/push/payload.ts'; console.log(Object.keys(p).join(','))"
PUSH_BODY_MAX_CHARS,PUSH_FAILURE_LIMIT,buildNinaPushPayload,classifyPushFailure,
encodeNinaPushPayload,parsePushSubscription,shouldRevokeSubscription,truncateForNotification
```

Node v22.23.1. Its one runtime dependency, `zod@4.4.3`, is in `package.json`'s `dependencies`, so it
survives the workflow's `npm ci --omit=dev`. **If phase 1 adds `server-only`, an `@/` import or any
I/O to `payload.ts`, this phase stops booting at 3am on a schedule.**

**Leaves alone (owned by others):**

- `lib/push/**` — phase 1. This phase **reads** `payload.ts` and edits nothing under `lib/`.
- `lib/nina/turnrun.ts` — phase 2. `lib/nina/imagerun.ts`, `lib/nina/imagejobs.ts` — phase 3.
  `lib/admin/**` — phase 4.
- `scripts/nina-image-worker.ts` (the barrel), `sql.ts`, `preflight.ts`, `claim.ts`, `dedupe.ts`,
  `generate.ts`, `store.ts`, `session.ts`, `cleanup.ts`, `run.ts`, `main.ts` — untouched.
  `finishAvatar`, which lives in `finish.ts`, keeps its signature and its body — it writes no
  `nina_messages` row, so there is nothing to notify about. `finishSelfie` and `closeFailed` are
  the two functions in that file this phase edits, and nothing else in it moves.
- The workflow's `run:` steps, the npm pin, `concurrency:`, `permissions:`, `schedule:` and the
  `workflow_dispatch` input — untouched. Only three lines and a comment go into `env:`.

---

## Where this matches phase 3, and where the two hosts deliberately differ

`phase-3.md` owns `lib/nina/imagerun.ts`'s `finishSelfie`, the in-platform twin of the function this
phase edits. Read together:

| | in-platform (phase 3) | off-platform (this phase) |
|---|---|---|
| `kind`, photograph | `'photo_delivered'` | **`'worker_photo_delivered'` — DIFFERENT, on purpose** |
| `kind`, apology | `'photo_apology'` | **`'worker_photo_apology'` — DIFFERENT, on purpose** |
| placement | last statement of `finishSelfie`, after both rows, after the dedupe re-check, after the blob release, after the job is closed | **identical, statement for statement** |
| `messages` | `[{ id: message.id, body: caption }]` | `[{ id: messageId, body: caption }]` |
| wrapping | its own `try`, `console.warn` on failure, never rethrows | **identical** |
| the body's *text* | `captionNinaPhoto` — a 4–8 s `glm-4.6v` call | `ninaImageCaption(jobId)` — the canned pool |
| the sender | `notifyNinaPush` (`lib/push/send.ts`) | `sendWorkerPush` (this phase's `push.ts`) |
| the log line | `console.warn('[nina] photo notify failed', …)` | `console.warn('[nina-worker] …', …)`, **and it never logs `userId`** |

The two `kind` rows are **not** a drift to reconcile either — they are the reconciler's ruling, on
the rung of the plans' own code blocks: `kind` is diagnostics only, and the backstop's whole reason
to exist is that it ran when the app did not. A `worker_*` line in an Actions log or a Vercel log is
the only evidence anywhere that this host, and not `lib/nina/imagerun.ts`, put that photograph in
the chat. One shared value would read the same on both hosts and answer nothing. **Anyone tempted to
collapse them should read this paragraph first.**

The two body-text rows are **not** a drift to reconcile. `finish.ts:126–132` already states it:
*"THE CANNED CAPTION IS PERMANENT ON THIS HOST, and it is not an inconsistency to fix. This worker
runs on a GitHub runner with no z.ai key."* The notification carries whatever the bubble carries, on
each host, which is the property that actually matters — a push whose body is not the message is
worse than no push.

The log-line row **is** load-bearing and is this host's own rule. `finish.ts:309–311` writes it:
*"Nothing identifying is logged — invariant 4, this repository is public and this line appears in an
Actions run."* `lib/push/send.ts:120–127` logs `userId` because its logs are Vercel's and private.

---

## Files

| File | Action | What changes |
|---|---|---|
| `scripts/nina-image-worker/push.ts` | **create** | the whole module: `sendWorkerPush`, the four `push_subscriptions` statements, the `web-push` `createRequire` shim, the VAPID read |
| `scripts/nina-image-worker/finish.ts` | modify | imports (`:12–28`); `finishSelfie`'s JSDoc (`:30–77`); its signature (`:78–83`); hoist the caption (`:84–91`, used at `:145`); the notify block appended at the end of `finishSelfie` (after `:178`); **`closeFailed`'s signature and the apology notify inside its `purpose === 'selfie'` branch (`:262–327`)** |
| `.github/workflows/nina-image.yml` | modify | three `VAPID_*` lines plus a comment in the `env:` block (`:92–95`) |
| `tests/nina.imageworker.test.ts` | modify | imports (`:1–21`); three new `describe` blocks appended after `:834` — `sendWorkerPush`, `finishSelfie`'s push, and `closeFailed`'s apology push |

Four files, as the plan index's Phase 5 row says.

---

## Implementation Steps

### Step 1: The worker's own sender

**File:** `scripts/nina-image-worker/push.ts` — new file.

**Change:** create the module. It is the worker's spelling of `lib/push/send.ts` + the two
`lib/push/queries.ts` bookkeeping writes, with every *decision* imported from `lib/push/payload.ts`
rather than restated.

**How much of `lib/push/queries.ts` is worth duplicating, and why — the brief asks for this
explicitly.** All of it, and the answer is cheaper than it looks: the three things that could
actually *drift in judgement* are `classifyPushFailure` (which status codes are terminal),
`shouldRevokeSubscription` (the consecutive-failure ceiling) and `PUSH_BODY_MAX_CHARS` (truncation),
and all three are **imported**, not copied. `PUSH_FAILURE_LIMIT` never appears in this file. What is
duplicated is four SQL statements — one SELECT and two UPDATEs and their WHERE clauses — which is
exactly the class of duplication `session.ts` and `dedupe.ts` already price and the barrel's header
already accounts for.

Skipping the two bookkeeping UPDATEs was considered and rejected on a concrete failure: `failure_count`
means *consecutive* failures, so a host that sends successfully without clearing the streak leaves a
subscription that failed four times in the app sitting at 4, and the app's very next failure revokes a
live phone one failure early. And a `410 Gone` seen only by this host would never be pruned here,
leaving a dead endpoint to be retried on every backstop run until the app happens to send. Two
statements close both.

**Code (complete file):**

```ts
/**
 * Notification: the push that tells him the photograph he asked for ninety seconds ago has landed,
 * sent from THIS host. The off-platform half of R1.
 *
 * Part of the `nina-image-worker/` split; the system-level doc — why this worker exists, why it is
 * `.ts`, what it cannot import, where it runs — lives in the barrel `../nina-image-worker.ts`. The
 * worker's import rules: `.ts`-suffixed relative imports only, no `@/` aliases, no `server-only`,
 * CJS packages through `createRequire`.
 *
 * ── WHY THIS FILE EXISTS AND IS NOT AN IMPORT OF `lib/push/send.ts` ───────────────────────────
 * That file opens `import 'server-only'` and reaches `@/lib/env` and `@/lib/push/queries` through
 * the alias. None of the three survives `--experimental-strip-types`; the barrel's header states
 * the rule, and `session.ts` and `dedupe.ts` are the same restatement answering their own
 * questions. So the split is POLICY IMPORTED, PLUMBING RESTATED:
 *
 *   imported from `../../lib/push/payload.ts`
 *     the wire format (`buildNinaPushPayload`, `encodeNinaPushPayload`), the pruning verdict
 *     (`classifyPushFailure`) and the revocation threshold (`shouldRevokeSubscription`). That
 *     module carries no `server-only` and does no I/O — deliberately, and the plan's invariant 8
 *     pins it — so every JUDGEMENT this file makes is the app's own function rather than a second
 *     opinion. In particular `PUSH_FAILURE_LIMIT` and `PUSH_BODY_MAX_CHARS` appear NOWHERE below.
 *     Measured before this file was written: `node --experimental-strip-types` imports that module
 *     cleanly, and its one dependency (`zod`) is a RUNTIME dependency, so it survives the
 *     workflow's `npm ci --omit=dev`.
 *
 *   restated here
 *     four statements against `push_subscriptions`, the TTL, and the `web-push` call. That is
 *     `lib/push/queries.ts`'s and `lib/push/send.ts`'s plumbing, and it is the duplication this
 *     host costs — the same trade the barrel's header prices for `lib/db/*`.
 *
 * ── `push_subscriptions` IS DELIBERATELY ABSENT FROM `preflight.ts`'S `REQUIRED_COLUMNS` ──────
 * Every other table this worker names is listed there, so a rename takes the workflow red before a
 * cent is spent. This one must not be, and the reason is the whole point of the phase: a drift in a
 * NOTIFICATION table would abort `preflight` and the backstop would never claim the job it exists
 * to rescue. A photograph must never be lost to a push. So the read below is wrapped instead, and a
 * drift surfaces as one `skipped` line in an Actions log while the generation completes. The column
 * names are pinned by `tests/nina.imageworker.test.ts` against the statements this file builds,
 * which is the same instrument `findContentDuplicate` gets, one layer down.
 *
 * ── IT NEVER THROWS ───────────────────────────────────────────────────────────────────────────
 * Every exit is a `WorkerPushReport`. A host with no VAPID keys, a user with notifications off, a
 * message with no body, an unreadable table and a dead endpoint are all NORMAL outcomes carrying a
 * `skipped` reason or a counter — never an exception. That is plan invariant 4 and it is what
 * `sendNinaPush` already guarantees in the app. The caller wraps it in a `try` anyway; this is the
 * belt to that brace.
 */
import { createRequire } from 'node:module'

import {
  buildNinaPushPayload,
  classifyPushFailure,
  encodeNinaPushPayload,
  shouldRevokeSubscription,
} from '../../lib/push/payload.ts'
import type { NinaPushKind } from '../../lib/push/payload.ts'

import type { NeonSql } from './sql.ts'

/**
 * `web-push`'s `sendNotification`, as much of it as this file uses. Written by hand for the same
 * reason `sql.ts` writes `NeonSql` by hand: a `require()`'s types are not reachable under
 * `--experimental-strip-types`. `@types/web-push` is a devDependency and is deliberately not
 * relied on here — the workflow installs `--omit=dev`.
 *
 * Exported because it is the test seam's type. See `sendWorkerPush`'s `sendFn`.
 */
export type SendWorkerNotification = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  options: Record<string, unknown>,
) => Promise<unknown>

/* `web-push` is CJS and is loaded the way every other script in `scripts/` loads such a package
 * (`scripts/blob-reap.mjs:34`), so this module needs no bundler and no transform beyond stripping.
 * It is a RUNTIME dependency in `package.json` (`web-push@3.6.7`), so `npm ci --omit=dev` — what
 * `.github/workflows/nina-image.yml` runs — installs it. Verified rather than assumed.
 *
 * `sendNotification` is already `.bind(webPush)`-ed by the package's own `src/index.js`, so pulling
 * it off the namespace below loses no receiver. */
const require = createRequire(import.meta.url)
const webPush = require('web-push') as {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void
  sendNotification: SendWorkerNotification
}

/**
 * How long a push service should hold an undelivered notification. Three hours — this is
 * `PUSH_TTL_SECONDS` (`lib/push/send.ts:46`), which is not exported, so the number is written twice
 * and said so here. The reasoning is that file's and the host does not change it: her messages are
 * about right now, and one that surfaces the following afternoon is not late, it is wrong.
 */
const WORKER_PUSH_TTL_SECONDS = 3 * 60 * 60

/**
 * A socket ceiling the app side deliberately does not have.
 *
 * `lib/push/send.ts` runs inside a Vercel invocation whose own `maxDuration` bounds a hung request.
 * This runs on a GitHub runner under `timeout-minutes: 6`, SHARED with up to `NINA_IMAGE_SWEEP_BUDGET`
 * generations of ~78 s each, and it runs AFTER the money is spent. `web-push` passes this straight
 * to `https.request`'s `timeout` and destroys the request when it fires (its `web-push-lib.js`
 * does the `pushRequest.destroy` itself), rejecting with a plain `Error` — no status code — which
 * `classifyPushFailure` reads as `'retry'`. So a slow network costs a notification, never a
 * subscription; five consecutive would, and ten seconds is generous for APNs.
 */
const WORKER_PUSH_TIMEOUT_MS = 10_000

/**
 * The worker's spelling of `PushSendReport` (`lib/push/send.ts:57`, not exported). Same five fields
 * and same meanings: `skipped` is a reason string and is the mechanism by which "notifications are
 * off", "this host has no VAPID keys" and "there was nothing to say" are all normal outcomes rather
 * than errors.
 */
export interface WorkerPushReport {
  attempted: number
  delivered: number
  /** Revoked by this send — a terminal status, or the consecutive-failure ceiling. */
  pruned: number
  /** Failed but kept. */
  retryable: number
  /** Set when nothing was even attempted, so a log line explains itself. */
  skipped: string | null
}

const NOTHING = (reason: string): WorkerPushReport => ({
  attempted: 0,
  delivered: 0,
  pruned: 0,
  retryable: 0,
  skipped: reason,
})

/**
 * The seam `finishSelfie` and `closeFailed` take their notifier through, so a test can assert the
 * call with no VAPID, no network and no database. `releaseBlobIfUnreferenced`'s `delFn` parameter (`cleanup.ts:36`) is
 * the precedent and the reason is the same one that file gives: the real implementation arrives
 * through `createRequire`, which no `vi.mock` registry reaches.
 */
export type WorkerNotifier = (
  sql: NeonSql,
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: NinaPushKind,
) => Promise<WorkerPushReport>

/** A subscription worth sending to: this user's, not revoked. `LivePushSubscription`
 * (`lib/push/queries.ts:49`) in the worker's spelling. */
interface WorkerPushSubscription {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  failureCount: number
}

/**
 * The three keys, read straight from `process.env` because `lib/env.ts`'s `pushEnv()` is one more
 * thing this host cannot import. Throws when any is absent or empty, and the ONE caller catches it
 * — that is plan invariant 4's exact shape, and `sendNinaPush`'s exact shape: a host with no VAPID
 * behaves as "no notifications", never as an error per job.
 *
 * NOT MEMOISED, unlike `lib/push/send.ts`'s `vapidConfigured`. That memo exists because a warm
 * lambda sends many times and `setVapidDetails` mutates module state. This process sends at most
 * `NINA_IMAGE_SWEEP_BUDGET` times and then calls `process.exit`. Dropping the memo costs one setter
 * call per push and buys a module with no cross-call state — which is what lets the test drive
 * "configured" and "not configured" in either order without a leaked module flag deciding the
 * verdict.
 *
 * `setVapidDetails` also throws on a malformed subject (it must be `mailto:` or `https:`) and on a
 * key pair that is not a P-256 point. That is why the caller's `try` wraps the whole call and not
 * just the presence check: a typo in a repository secret is "no notifications", not a red workflow.
 */
function configureVapid(): void {
  const subject = process.env.VAPID_SUBJECT
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!subject || !publicKey || !privateKey) {
    throw new Error('VAPID_SUBJECT, VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must all be set')
  }
  webPush.setVapidDetails(subject, publicKey, privateKey)
}

/**
 * `listLivePushSubscriptions` (`lib/push/queries.ts:105`), clause for clause: this user's rows, not
 * revoked. Owner-scoped (invariant 5) even though `endpoint` is globally unique by RFC 8030 — that
 * file's header makes the argument and it does not get weaker on another host.
 *
 * A list rather than a row because the same account on a phone and on a laptop is two rows.
 */
async function listLiveSubscriptions(
  sql: NeonSql,
  userId: string,
): Promise<WorkerPushSubscription[]> {
  const rows = (await sql`
    select id, endpoint, p256dh, auth, failure_count
    from push_subscriptions
    where user_id = ${userId} and revoked_at is null
  `) as Array<{
    id: string
    endpoint: string
    p256dh: string
    auth: string
    failure_count: number
  }>

  return rows.map((row) => ({
    id: row.id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    /* `Number()` rather than a bare read: neon-http hands an `integer` back as a JS number today,
     * and `shouldRevokeSubscription` does arithmetic on it. A string here would make `4 + 1 >= 5`
     * read `'4' + 1 >= 5` and silently stop revoking anything. */
    failureCount: Number(row.failure_count),
  }))
}

/**
 * `recordPushSuccess` (`lib/push/queries.ts:141`). Clears the failure streak, because the streak is
 * about CONSECUTIVE failures.
 *
 * `now()` rather than a bound `new Date()`: the app stamps its own clock because it has one that
 * agrees with the database's region. This runs on a GitHub runner, and unlike `dispatchCutoffFor`
 * — where the skew is deliberately absorbed by a forward window — these two columns are never
 * compared against anything (`lib/push/send.ts` states that `lastSuccessAt` is not consulted on
 * purpose), so the database's clock is simply the better one.
 */
async function recordSuccess(sql: NeonSql, userId: string, id: string): Promise<void> {
  await sql`
    update push_subscriptions
    set last_success_at = now(), failure_count = 0, last_failure_at = null
    where user_id = ${userId} and id = ${id}
  `
}

/**
 * `recordPushFailure` (`lib/push/queries.ts:170`) — the pruning, in one statement.
 *
 * `failure_count + 1` in SQL rather than from a value read in TypeScript, so two concurrent sends
 * cannot both write "1"; that is that function's reasoning and it is unchanged. `revoke` is decided
 * by `shouldRevokeSubscription` — the app's own function, imported — and carried in as a boolean
 * rather than recomputed here, so there is exactly one place in this codebase that decides whether
 * a subscription is dead.
 *
 * The `case when` keeps it to one round trip, which `session.ts`'s header explains is worth caring
 * about on neon-http. The `::boolean` cast is the same idiom `resolveWorkerSessionId` uses for
 * `${replyToId}::text`, and it is required: the parameter arrives as text and `case when $1 then`
 * would not type-resolve.
 */
async function recordFailure(
  sql: NeonSql,
  userId: string,
  id: string,
  revoke: boolean,
): Promise<void> {
  await sql`
    update push_subscriptions
    set last_failure_at = now(),
        failure_count = failure_count + 1,
        revoked_at = case when ${revoke}::boolean then now() else revoked_at end
    where user_id = ${userId} and id = ${id}
  `
}

/** An endpoint is 300 characters of which the host is the only informative part. */
function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return 'unparseable'
  }
}

/**
 * **Fan one message out to every live subscription this user has, from this host.**
 * `sendNinaPush` (`lib/push/send.ts:150`), restated. Sequential and one failure stops nothing, for
 * that function's reason: two subscriptions is the realistic maximum and a rejected promise inside
 * a `Promise.all` would abandon the remaining sends AND their database updates.
 *
 * The order of the three early exits is deliberate. The payload is built FIRST, so a message with
 * no body costs no VAPID read and no query; VAPID is checked SECOND, so the branch every run takes
 * until the repository secrets exist is the cheapest one; the table is read LAST.
 *
 * `sendFn` is the test seam — see `SendWorkerNotification`. It defaults to the real
 * `web-push.sendNotification` and nothing in the worker ever passes it.
 */
export async function sendWorkerPush(
  sql: NeonSql,
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: NinaPushKind,
  sendFn: SendWorkerNotification = webPush.sendNotification,
): Promise<WorkerPushReport> {
  const payload = buildNinaPushPayload({ messages, kind })
  if (payload == null) return NOTHING('no message body to send')

  try {
    configureVapid()
  } catch (cause) {
    /* THE OPS STEP THIS COMMIT CANNOT PERFORM. Until `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and
     * `VAPID_SUBJECT` exist as repository secrets (Settings -> Secrets and variables -> Actions,
     * with the values from the Vercel Production environment), this is the branch every scheduled
     * run takes — and it is a log line and an exit 0, never a failed job. The workflow's `env:`
     * block carries the same note. */
    return NOTHING(`VAPID not configured: ${String(cause)}`)
  }

  let subscriptions: WorkerPushSubscription[]
  try {
    subscriptions = await listLiveSubscriptions(sql, userId)
  } catch (cause) {
    /* `push_subscriptions` is deliberately absent from `preflight`'s `REQUIRED_COLUMNS` — see this
     * file's header — so a drift or an unapplied migration surfaces HERE, as a skipped
     * notification, instead of as a red workflow that never claims the job it exists to rescue. */
    return NOTHING(`subscriptions unreadable: ${String(cause)}`)
  }
  if (subscriptions.length === 0) return NOTHING('no live subscriptions')

  const report: WorkerPushReport = {
    attempted: 0,
    delivered: 0,
    pruned: 0,
    retryable: 0,
    skipped: null,
  }
  const body = encodeNinaPushPayload(payload)

  for (const subscription of subscriptions) {
    report.attempted += 1

    try {
      await sendFn(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        body,
        {
          TTL: WORKER_PUSH_TTL_SECONDS,
          urgency: 'normal',
          /* One tag for every Nina notification, so a second replaces the first in the tray rather
           * than stacking. The value is the payload's — `PUSH_NOTIFICATION_TAG` is module-private
           * in `payload.ts`, and reading it back off the payload is better than a second copy of
           * the string. */
          topic: payload.tag,
          timeout: WORKER_PUSH_TIMEOUT_MS,
        },
      )
    } catch (cause) {
      /* `WebPushError` carries `statusCode`; anything else (a socket, DNS, the timeout above) has
       * none. The PROPERTY is read rather than the class `instanceof`-checked, because the class
       * arrives through `createRequire` and `classifyPushFailure` already reads a non-number as
       * retryable — so the duck-typed read cannot be wrong in a way the class check would catch. */
      const raw = (cause as { statusCode?: unknown }).statusCode
      const statusCode = typeof raw === 'number' ? raw : null
      const verdict = classifyPushFailure(statusCode)
      const revoke = shouldRevokeSubscription({ verdict, failureCount: subscription.failureCount })

      /* NOTHING IDENTIFYING. This repository is public and this line appears in an Actions run —
       * `closeFailed`'s catch states the rule for this file. `lib/push/send.ts` logs `userId`
       * because its logs are Vercel's and private. The host is the informative part of a
       * 300-character endpoint, and the subscription id is a nanoid naming a row nobody without
       * DATABASE_URL can read — the same argument the workflow's `job_id` input comment makes. */
      console.warn('[nina-worker] push failed', {
        subscriptionId: subscription.id,
        host: hostOf(subscription.endpoint),
        statusCode,
        verdict,
      })

      try {
        await recordFailure(sql, userId, subscription.id, revoke)
      } catch (bookkeeping) {
        console.warn('[nina-worker] push bookkeeping failed', { error: String(bookkeeping) })
      }
      report[revoke ? 'pruned' : 'retryable'] += 1
      continue
    }

    /* THE ONE PLACE THIS FILE DOES NOT MIRROR `sendPushToSubscription`, ON PURPOSE. There,
     * `recordPushSuccess` sits INSIDE the send's `try`, so a database fault after a delivered
     * notification lands in the catch, is classified as a retryable send failure, and INCREMENTS
     * the failure streak of a subscription that just worked. Splitting the two `try`s costs three
     * lines and removes a class of "my phone stopped buzzing" with no cause in any log. */
    try {
      await recordSuccess(sql, userId, subscription.id)
    } catch (bookkeeping) {
      console.warn('[nina-worker] push bookkeeping failed', { error: String(bookkeeping) })
    }
    report.delivered += 1
  }

  return report
}
```

**Impact:** a new module, imported by `finish.ts` only. No existing behaviour changes until step 2.
`tsc --noEmit` now typechecks it (`tsconfig.json` includes `**/*.ts`), and the `.ts` import
specifiers are legal because `allowImportingTsExtensions` is already on — the barrel's header records
why.

---

### Step 2: Send it from `finishSelfie`, and from `closeFailed`

**File:** `scripts/nina-image-worker/finish.ts` — five edits in `finishSelfie` (2a–2e) and one in
`closeFailed` (2f). Those two functions are the file's only `nina_messages` writers; `finishAvatar`
writes none and is untouched.

#### 2a. Imports

**File:** `scripts/nina-image-worker/finish.ts:23–28`

**Change:** add the two local imports, keeping the file's existing grouping (`lib/` relatives first,
then `./` siblings, values before `import type`).

**Code (complete replacement for lines 23–28):**

```ts
import { releaseBlobIfUnreferenced } from './cleanup.ts'
import { findContentDuplicate } from './dedupe.ts'
import { sendWorkerPush } from './push.ts'
import { resolveWorkerSessionId } from './session.ts'
import type { ClaimedJob } from './claim.ts'
import type { WorkerNotifier } from './push.ts'
import type { WorkerStoredImage } from './store.ts'
import type { NeonSql } from './sql.ts'
```

#### 2b. `finishSelfie`'s docstring gains the notification paragraph

**File:** `scripts/nina-image-worker/finish.ts:73–77` — the last paragraph of the JSDoc, immediately
above `export async function finishSelfie`.

**Change:** append one section after the existing media-dedupe P3 italic note. Everything above it in
that docstring is unchanged.

**Code (complete replacement for lines 73–77, i.e. the italic paragraph plus the closing `*/`):**

```ts
 * *media-dedupe P3: the image row is written from `planNinaImageWrite` — the same pure function the
 * app side calls — so a generation whose bytes this user already stores lands as a REFERENCE with no
 * second object; the race between the pre-put lookup and this insert is closed HERE, and the loser
 * blob is released only after the row that replaced it is in.*
 *
 * ── nina-push-every-message R1: THE KNOCK ON THE DOOR, FROM THIS HOST ─────────────────────────
 * He asked for this photograph ninety seconds ago and has certainly locked his phone. Until this
 * phase the only way he learned it had arrived was opening `/nina` and looking — and this is the
 * host that finishes the jobs the app's own invocation was killed mid-flight, so it is the host
 * where the wait was longest.
 *
 * `lib/nina/imagerun.ts`'s `finishSelfie` is the in-platform twin and sends its push at the SAME
 * point in its own function: last statement, after both rows, after the dedupe re-check, after the
 * ledger is closed.
 *
 * **It stamps a DIFFERENT kind, and that is deliberate.** That host sends `'photo_delivered'`;
 * this one sends `'worker_photo_delivered'`. `NinaPushPayload.kind` is diagnostics only, and
 * "which host delivered this photograph" is exactly the diagnostic this backstop exists to
 * produce — it runs ONLY when the app's own invocation was killed, so a `worker_*` value in a log
 * line is the one signal anywhere that says the backstop fired. Collapsing the two into one value
 * would read identically on both hosts and answer nothing. DO NOT TIDY THEM TOGETHER.
 *
 * The bodies differ too — that host captions with `glm-4.6v` and this one uses `ninaImageCaption`'s
 * pool — and that is not a drift to fix either, for the reason the INSERT's own comment gives
 * below. The notification carries whatever the bubble carries, on each host, which is the property
 * that matters.
 *
 * **`notify` is a parameter with a default, and that is the test seam.** `sendWorkerPush` reaches
 * `web-push` through `createRequire`, which no `vi.mock` registry reaches, so the only way a test
 * can assert the call is to hand one in. The precedent is `releaseBlobIfUnreferenced`'s `delFn`.
 * `run.ts` passes four arguments and is unchanged.
 */
```

#### 2c. The signature, and the caption hoisted to one value

**File:** `scripts/nina-image-worker/finish.ts:78–91`

**Change:** add the fifth parameter; compute the caption once so the bubble's text and the
notification's body are the same string by construction rather than by two calls that agree.

**Code (complete replacement for lines 78–91):**

```ts
export async function finishSelfie(
  sql: NeonSql,
  job: ClaimedJob,
  image: WorkerStoredImage,
  result: { costMicroUsd: number; latencyMs: number },
  /** Test seam; see the header. Defaults to the real sender and `run.ts` never passes it. */
  notify: WorkerNotifier = sendWorkerPush,
): Promise<void> {
  const messageId = newId()
  const imageId = newId()
  const { jobId, userId, args } = job

  /* ONE value, used twice: the text of the bubble and the body of the notification. Two
   * `ninaImageCaption(jobId)` calls WOULD agree — it is a pure FNV-1a over the job id, which is
   * exactly why it is deterministic — so this is about making the agreement structural instead of
   * merely true. A notification whose body is not the message is worse than no notification. */
  const caption = ninaImageCaption(jobId)

  const sessionId = await resolveWorkerSessionId(sql, userId, args.replyToId)
  if (sessionId == null) {
    throw new Error(`no session to file the photograph in (job ${jobId})`)
  }
```

#### 2d. Bind the hoisted caption in the INSERT

**File:** `scripts/nina-image-worker/finish.ts:141–149` — the `nina_messages` INSERT. The 19-line
comment above it (`:122–140`) is unchanged.

**Change:** `${ninaImageCaption(jobId)}` becomes `${caption}`. Nothing else in the statement moves.

**Code (complete replacement for lines 141–149):**

```ts
  await sql`
    insert into nina_messages
      (id, user_id, session_id, role, text, source, turn_id, reply_to_id, photo_only)
    values (
      ${messageId}, ${userId}, ${sessionId}, 'nina', ${caption}, 'chat', ${jobId},
      (select id from nina_messages where id = ${args.replyToId} and user_id = ${userId}),
      true
    )
  `
```

#### 2e. The notify, as the last statement of the function

**File:** `scripts/nina-image-worker/finish.ts:172–179` — the blob-release block through the closing
brace of `finishSelfie`.

**Change:** append the notify after the release. The release block itself is unchanged.

**Why the very end.** The brief says *"after that insert"*; every statement below line 149 satisfies
that, and the tie-breakers pick the last one:

- **After the image row** — so a tap opens a chat with a picture in it rather than a caption above
  an empty frame. Phase 3 makes the same call for the same reason.
- **After `update nina_turns set status = 'ok'`** — this function's own "THE ORDER IS LOAD-BEARING"
  docstring says a crash between the rows and the close leaves a `pending` job whose photo is
  already in the chat, which a sweep later apologises for. `sendWorkerPush` awaits a signed HTTPS
  POST per live subscription; putting it before the close would put seconds of network inside
  exactly that window, on a host with a shared six-minute budget.
- **After `releaseBlobIfUnreferenced`** — the one delete rule of the whole plan set is ROW FIRST,
  BLOB SECOND, and nothing should get between the row and the release, least of all a network call.

Placed last, the worst a push can cost is the push.

**Code (complete replacement for lines 172–179):**

```ts
  /* Loser bytes out, after the row that replaced them is in — ROW FIRST, BLOB SECOND. Reached
   * only on the race path: the skip path never put anything. If the INSERT above throws instead,
   * the loser blob stays behind and the reaper owns it — the same orphan class the existing
   * `finish:` failure branch already documents. */
  if (writePlan.release != null) {
    await releaseBlobIfUnreferenced(sql, userId, writePlan.release)
  }

  /*
   * R1, from this host. See the header for why it is here and not higher up, and for why the body
   * is `caption`.
   *
   * ── ITS OWN `try`, AND IT SWALLOWS (PLAN INVARIANT 2) ────────────────────────────────────────
   * `sendWorkerPush` never throws on its own account — a runner with no `VAPID_*` is reported as
   * `skipped`, not raised — so reaching this catch means a bug or an injected notifier. Neither is
   * worth a photograph: the bubble is in the chat, the image row is in, the job is closed `ok`, and
   * throwing here would send `runOneJob` into `closeFailed`, which would mark a DELIVERED
   * generation `failed` and apologise for a picture he can already see. That is the same blast
   * radius Finding 1 had, and the same wrapping closes it.
   *
   * The report is logged rather than returned: this function is `Promise<void>` and a photograph's
   * success has nothing to do with whether a phone was reachable. `jobId` only — invariant 4, this
   * line appears in a public Actions log.
   */
  try {
    const report = await notify(sql, userId, [{ id: messageId, body: caption }], 'worker_photo_delivered')
    console.info('[nina-worker] notified', { jobId, ...report })
  } catch (cause) {
    console.warn('[nina-worker] the notification could not be sent; the photograph is in', {
      jobId,
      error: String(cause),
    })
  }
}
```

**Impact (2a–2e):** a photograph finished by the backstop now pushes its caption. `finishAvatar`
(`finish.ts:199`) is untouched and writes no `nina_messages` row at all — *"Nobody asked in chat"* —
so there is nothing to notify about; the `avatar_changed` proactive trigger already covers it through
`lib/nina/proactive.ts`. `closeFailed`'s apology is covered by 2f below.

---

#### 2f. `closeFailed` apologises — and buzzes the phone too

**File:** `scripts/nina-image-worker/finish.ts:262–327` — `closeFailed`'s signature, its
`args.purpose === 'selfie'` branch, and the statement after its terminal `UPDATE`.

**ASSIGNED WORK, NOT A HANDOFF.** This plan originally recorded the worker's apology as an unowned
gap and asked the reconciler to place it. It is placed: **this phase owns it.** `closeFailed` writes
an apology row on this host — the off-platform twin of `postNinaApologyMessage`, which phase 3 does
push — and it is the **last uncovered `nina_messages` write in the set**. Leaving it uncovered would
fail R1's *"everytime"* on the one host the runner cannot see: a job the app's own invocation
abandoned, given up on a GitHub runner at 3am, with no way to tell him. This phase already owns the
file, already built the seam, and the addition is ~8 lines.

**Change:** three things, all inside this one function.

1. The same defaulted `notify` parameter `finishSelfie` took in 2c.
2. Hoist the apology's id and text out of the INSERT into two `const`s, so the row and the
   notification carry the same id and the same sentence **by construction**. `ninaImageApology` is
   a pure deterministic draw over `(kind, jobId)` — two calls WOULD agree — but `newId()` is not,
   and the notification's `messageId` must name the row that exists.
3. Notify after the terminal `UPDATE`, in its own `try`, with `'worker_photo_apology'`.

**Why the notify is NOT inside the existing `try`.** That `try`'s `catch` logs *"the apology could
not be written; closing the job anyway"* and the header says it MUST stay best-effort — that throw
is what once killed the process before the money was recorded. A notify failure escaping into it
would file itself under a message that **did** get written, which is a log line that lies. The
existing `try` keeps covering exactly the write it covers today; the notify gets its own.

**Why after the terminal `UPDATE` and not right after the INSERT.** `finishSelfie`'s reasoning, one
function over: this is a signed HTTPS POST per live subscription on a host with a six-minute budget
shared across generations, and the job is still `pending` until that `UPDATE` lands. Seconds of
network inside that window is the one thing this file's own "THE ORDER IS LOAD-BEARING" rule exists
to prevent. Placed last, the worst a push can cost is the push.

**Why `'worker_photo_apology'` and not phase 3's `'photo_apology'`.** The same reason the two
delivered-photograph kinds differ: `kind` is diagnostics only, and this is the host that only runs
when the app's did not. See the Requires block.

**Code (the signature — complete replacement for lines 262–272):**

```ts
export async function closeFailed(
  sql: NeonSql,
  job: ClaimedJob,
  outcome: {
    kind: NinaImageFailure
    latencyMs: number
    detail: string
    /** Micro-USD this attempt is KNOWN to have spent. Null when the call returned no figure. */
    costMicroUsd: number | null
  },
  /** Test seam; see `finishSelfie`'s header. Defaults to the real sender; `run.ts` never passes it. */
  notify: WorkerNotifier = sendWorkerPush,
): Promise<'retry' | 'gave-up'> {
```

**Code (the selfie branch — complete replacement for lines 291–317, the `if (args.purpose ===
'selfie')` block; the `catch` and its comment are unchanged):**

```ts
  /* Bound outside the branch so the notify after the terminal UPDATE can see it. Null means NO ROW
   * WAS WRITTEN — no session resolved, or the write threw — and a notification about a message that
   * does not exist is strictly worse than silence. Same rule phase 3 applies to
   * `postNinaApologyMessage`'s `insertNinaMessages` returning `[]`; different mechanism, because
   * this host writes raw SQL and gets no row back to test. */
  let apology: { id: string; body: string } | null = null

  if (args.purpose === 'selfie') {
    try {
      const sessionId = await resolveWorkerSessionId(sql, userId, args.replyToId)
      if (sessionId == null) {
        console.warn('[nina-worker] no session for the apology; closing the job anyway', { jobId })
      } else {
        /* ONE id and ONE sentence, used by the INSERT and by the notification. `ninaImageApology`
         * is deterministic over (kind, jobId) so two calls would agree — but `newId()` is not, and
         * `NinaPushPayload.messageId` must name the row that actually exists. */
        const messageId = newId()
        const body = ninaImageApology(outcome.kind, jobId)

        await sql`
          insert into nina_messages
            (id, user_id, session_id, role, text, source, turn_id, reply_to_id)
          values (
            ${messageId}, ${userId}, ${sessionId}, 'nina', ${body},
            'chat', ${jobId},
            (select id from nina_messages where id = ${args.replyToId} and user_id = ${userId})
          )
        `
        /* Only after the INSERT resolved. If it threw, the catch below runs and this stays null. */
        apology = { id: messageId, body }
      }
    } catch (cause) {
      /* Best-effort, and it MUST stay that way. See the header: this throw is what killed the
       * process before the money could be recorded. Nothing identifying is logged — invariant 4,
       * this repository is public and this line appears in an Actions run. */
      console.warn('[nina-worker] the apology could not be written; closing the job anyway', {
        jobId,
        error: String(cause),
      })
    }
  }
```

**Code (the tail — complete replacement for lines 319–327, the terminal `UPDATE` and the return):**

```ts
  await sql`
    update nina_turns
    set status = 'failed', error_code = ${outcome.kind}, latency_ms = ${outcome.latencyMs},
        cost_micro_usd = coalesce(cost_micro_usd, 0)
          + ${outcome.costMicroUsd ?? NINA_IMAGE_COST_MICRO_USD}
    where id = ${jobId} and user_id = ${userId} and status = 'pending'
  `

  /*
   * ── R1, THE OTHER HALF: TWENTY MINUTES IS A LONG TIME TO WAIT FOR A PHOTO THAT IS NOT COMING ─
   * The last uncovered `nina_messages` write in this plan set, on the host the runner cannot see.
   * The app apologises through `lib/nina/imagejobs.ts`'s `postNinaApologyMessage` (phase 3) and
   * pushes `'photo_apology'`; this is the same sentence, from the backstop, under its own
   * `'worker_photo_apology'` — see this file's `finishSelfie` header for why the two hosts keep
   * separate kinds.
   *
   * `apology == null` covers every path that wrote no row: a retry (which returned above), an
   * avatar job (which never enters the branch), a session that would not resolve, and an INSERT
   * that threw. None of them may buzz a phone.
   *
   * ── ITS OWN `try`, AND IT SWALLOWS (PLAN INVARIANT 2) ───────────────────────────────────────
   * Deliberately NOT the `try` around the write above: that one's catch logs "the apology could
   * not be written", and a notify failure landing there would file itself under a message that
   * did get written. The job is already closed `failed` by the statement above, so nothing here
   * can reopen it — throwing would only take `runOneJob` down after the money was recorded, which
   * is the exact failure this function's header exists to prevent. `jobId` only: invariant 4, this
   * line appears in a public Actions log.
   */
  if (apology != null) {
    try {
      const report = await notify(sql, userId, [apology], 'worker_photo_apology')
      console.info('[nina-worker] apology notified', { jobId, ...report })
    } catch (cause) {
      console.warn('[nina-worker] the apology notification could not be sent; the job is closed', {
        jobId,
        error: String(cause),
      })
    }
  }

  return 'gave-up'
}
```

**Impact:** a photograph the backstop gives up on now buzzes the phone with her apology. The retry
branch (`attempts < NINA_IMAGE_MAX_ATTEMPTS`) returns above all of this and is untouched — a job that
will be tried again has said nothing to apologise for. An avatar job never enters the branch and so
never notifies, matching `finishAvatar`'s silence and phase 3's identical decision. The terminal
`UPDATE`, the cost accumulation, the two `console.warn` lines and the `'retry' | 'gave-up'` return
are all byte-identical to today.

---

### Step 3: The three `VAPID_*` lines in the workflow

**File:** `.github/workflows/nina-image.yml:92–95` — the `env:` block of the `generate` job.

**Change:** three lines and a comment. `timeout-minutes: 6` and its comment above, and every `steps:`
entry below, are untouched.

**Code (complete replacement for lines 92–95):**

```yaml
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}
      OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}

      # ── THE NOTIFICATION, AND THE ONE STEP THIS COMMIT COULD NOT PERFORM ──────────────────────
      # When this backstop finishes a photograph, scripts/nina-image-worker/push.ts sends the same
      # Web Push the app sends for the same event — otherwise the runner learns his picture arrived
      # only by opening /nina, which on the backstop path is the longest wait in the system.
      #
      # THESE THREE SECRETS DO NOT EXIST YET. Only the repository owner can add them, in
      # Settings -> Secrets and variables -> Actions, and they MUST be byte-identical to the Vercel
      # Production environment's: a push is signed for one VAPID key pair, and a runner signing with
      # a different one is refused by the push service for every subscription the app registered.
      # (Production scope, not Preview — see the note in docs about VAPID_* being production-only.)
      #
      # UNTIL THEY EXIST, NOTHING BREAKS. An undefined secret interpolates to the empty string, the
      # worker reads that as "no VAPID", logs `skipped: 'VAPID not configured'` and returns. The
      # photograph is still written, the job is still closed `ok`, the run still exits 0. That is
      # deliberate and it is why these three are NOT in preflight.ts's REQUIRED_ENV: a missing
      # notification must never stop a generation this workflow exists to rescue.
      VAPID_PUBLIC_KEY: ${{ secrets.VAPID_PUBLIC_KEY }}
      VAPID_PRIVATE_KEY: ${{ secrets.VAPID_PRIVATE_KEY }}
      VAPID_SUBJECT: ${{ secrets.VAPID_SUBJECT }}
```

**Impact:** the three variables reach the `Generate` step's process environment. Nothing else in the
run changes; `npm ci --omit=dev` sees three more empty variables and does not care.

---

### Step 4: The test

**File:** `tests/nina.imageworker.test.ts` — two edits.

#### 4a. Imports

**File:** `tests/nina.imageworker.test.ts:1–21`

**Change:** add `beforeEach` to the vitest import, `generateVAPIDKeys` from `web-push` (a
devDependency with types, and the test is not under the worker's module rules, so a plain package
import is correct here), and the new module by its own path — **not** through the barrel, which does
not re-export it.

**Code (complete replacement for lines 1–21):**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateVAPIDKeys } from 'web-push'

import {
  claimJob,
  closeFailed,
  dispatchCutoffFor,
  findContentDuplicate,
  findSchemaDrift,
  finishSelfie,
  generate,
  parseArgv,
  releaseBlobIfUnreferenced,
  REQUIRED_COLUMNS,
  resolveWorkerSessionId,
} from '../scripts/nina-image-worker.ts'
import type { ClaimedJob, SchemaColumn } from '../scripts/nina-image-worker.ts'
/* Imported by its own path, not through the barrel: the barrel's published surface is the old
 * single file's surface (its header states the rule, which is also why `finishAvatar` is absent
 * from it), and `push.ts` did not exist then. */
import { sendWorkerPush } from '../scripts/nina-image-worker/push.ts'
import type {
  SendWorkerNotification,
  WorkerNotifier,
  WorkerPushReport,
} from '../scripts/nina-image-worker/push.ts'
import {
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_DISPATCH_GRACE_MS,
  /* New: the `closeFailed` apology cases need a job AT the attempt ceiling, so that it gives up
   * rather than queueing a retry. The real constant, not a literal — a bump to it must move the
   * fixture, not silently turn six cases into retry cases that assert nothing. */
  NINA_IMAGE_MAX_ATTEMPTS,
  OPENROUTER_IMAGE_URL,
} from '../lib/nina/imagerecipe.ts'
```

#### 4b. The three new `describe` blocks

**File:** `tests/nina.imageworker.test.ts` — appended after line 834 (the end of the
`REQUIRED_COLUMNS` block, the last in the file).

**Change:** append. Nothing above is edited. `fakeSql`, `sent`, `sqlResolving`, `jobFixture`,
`SESSION_ID` and `FakeSql` are the file's existing module-scope helpers and are reused as they are.

`beforeEach` is scoped **inside** each new `describe` rather than at file scope, so the eleven
existing suites — several of which build `vi.fn` stubs inside their own test bodies — are untouched.

Three blocks: `sendWorkerPush` (the module), `finishSelfie`'s push, and `closeFailed`'s apology push
(Step 2f's work).

**Code (append at the end of the file):**

```ts
/**
 * **The off-platform half of nina-push-every-message R1.**
 *
 * No network, no key, no database — the same three noes the rest of this file holds to. The send
 * itself arrives through `createRequire`, which no `vi.mock` registry reaches, so it is injected;
 * everything else is real, including `configureVapid`, which is driven with a genuine key pair
 * generated offline so that the "configured" path is exercised rather than stubbed past.
 */
describe('sendWorkerPush — the app’s sender, restated for a host that cannot import it', () => {
  /* A real P-256 pair, generated offline by web-push itself. `setVapidDetails` validates the point,
   * so a made-up string would throw and every test below would take the "not configured" branch
   * while appearing to test the others. */
  const VAPID = generateVAPIDKeys()
  const USER = 'user00000001'
  const BUBBLE = [{ id: 'msg000000002', body: 'ini fotonya' }]

  const SUB = {
    id: 'sub000000001',
    endpoint: 'https://web.push.apple.com/abcdef',
    p256dh: 'p256dh-key',
    auth: 'auth-secret',
    failure_count: 0,
  }

  /** A `sql` that answers the subscription SELECT with `rows` and everything else with []. */
  function sqlWithSubscriptions(rows: unknown[], options: { failOn?: RegExp } = {}): FakeSql {
    return fakeSql({
      failOn: options.failOn,
      rows: (call) => (/from push_subscriptions/.test(call.text) ? rows : []),
    })
  }

  function withVapid(): void {
    vi.stubEnv('VAPID_SUBJECT', 'mailto:nina@example.com')
    vi.stubEnv('VAPID_PUBLIC_KEY', VAPID.publicKey)
    vi.stubEnv('VAPID_PRIVATE_KEY', VAPID.privateKey)
  }

  /** A send that resolves. Typed, so `mock.calls[0]` is a tuple and not `[]`. */
  function stubSend(outcome?: Error) {
    return vi.fn<SendWorkerNotification>(async () => {
      if (outcome != null) throw outcome
      return { statusCode: 201 }
    })
  }

  beforeEach(() => {
    vi.resetAllMocks()
    vi.unstubAllEnvs()
  })

  it('skips with a reason, and touches nothing at all, when this host has no VAPID keys', async () => {
    /* THE BRANCH EVERY RUN TAKES UNTIL THE THREE REPOSITORY SECRETS EXIST. Stubbed to '' rather
     * than left unset, so a developer who happens to export VAPID_* in their shell gets the same
     * verdict as CI. Plan invariant 4: a host with no keys is "no notifications", never an error. */
    vi.stubEnv('VAPID_SUBJECT', '')
    vi.stubEnv('VAPID_PUBLIC_KEY', '')
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    const sql = sqlWithSubscriptions([SUB])
    const send = stubSend()

    const report = await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', send)

    expect(report.skipped).toMatch(/VAPID/)
    expect(report.attempted).toBe(0)
    expect(send).not.toHaveBeenCalled()
    /* Not even the SELECT: the cheapest branch is the one every run takes. */
    expect(sql.calls).toHaveLength(0)
  })

  it('skips before reading anything when no bubble has a body', async () => {
    withVapid()
    const sql = sqlWithSubscriptions([SUB])
    const send = stubSend()

    const report = await sendWorkerPush(sql, USER, [{ id: 'm1', body: '   ' }], 'worker_photo_delivered', send)

    expect(report.skipped).toBe('no message body to send')
    expect(send).not.toHaveBeenCalled()
    expect(sql.calls).toHaveLength(0)
  })

  it('asks the owner-scoped, not-revoked question `listLivePushSubscriptions` asks', async () => {
    withVapid()
    const sql = sqlWithSubscriptions([SUB])

    await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', stubSend())

    const [select] = sent(sql, /from push_subscriptions/)
    expect(select?.text).toMatch(/user_id = \$\d+/)
    expect(select?.text).toMatch(/revoked_at is null/)
    /* Every column this statement names, so a rename is caught here — `push_subscriptions` is
     * deliberately NOT in preflight's REQUIRED_COLUMNS (a drift must not abort a generation), so
     * this assertion is the instrument that replaces it. */
    for (const column of ['id', 'endpoint', 'p256dh', 'auth', 'failure_count']) {
      expect(select?.text, column).toContain(column)
    }
    expect(select?.values).toContain(USER)
  })

  it('"notifications are off" is a normal outcome, not an error', async () => {
    withVapid()
    const sql = sqlWithSubscriptions([])
    const send = stubSend()

    const report = await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', send)

    expect(report.skipped).toBe('no live subscriptions')
    expect(send).not.toHaveBeenCalled()
  })

  it('sends the wire format lib/service-worker.js reads, under the one Nina tag', async () => {
    withVapid()
    const sql = sqlWithSubscriptions([SUB])
    const send = stubSend()

    await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', send)

    const call = send.mock.calls[0]!
    expect(call[0]).toEqual({
      endpoint: SUB.endpoint,
      keys: { p256dh: SUB.p256dh, auth: SUB.auth },
    })
    /* Built by `buildNinaPushPayload`, not assembled here — the whole point of importing
     * `lib/push/payload.ts` is that the two hosts cannot disagree about the wire. */
    expect(JSON.parse(call[1] as string)).toEqual({
      v: 1,
      title: 'Nina',
      body: 'ini fotonya',
      url: '/nina',
      tag: 'nina',
      messageId: 'msg000000002',
      kind: 'worker_photo_delivered',
    })
    const options = call[2] as Record<string, unknown>
    expect(options.TTL).toBe(3 * 60 * 60)
    expect(options.urgency).toBe('normal')
    expect(options.topic).toBe('nina')
    /* The ceiling the app side does not have: this runs under `timeout-minutes: 6` shared with
     * three 78-second generations. */
    expect(options.timeout).toBeTypeOf('number')
  })

  it('a delivered push clears the failure streak', async () => {
    withVapid()
    const sql = sqlWithSubscriptions([{ ...SUB, failure_count: 3 }])

    const report = await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', stubSend())

    expect(report).toEqual({
      attempted: 1,
      delivered: 1,
      pruned: 0,
      retryable: 0,
      skipped: null,
    })
    const [update] = sent(sql, /update push_subscriptions/)
    expect(update?.text).toMatch(/failure_count = 0/)
    expect(update?.text).toMatch(/last_success_at = now\(\)/)
    expect(update?.values).toContain(SUB.id)
    expect(update?.values).toContain(USER)
  })

  it('a 410 Gone revokes the subscription in the same statement', async () => {
    withVapid()
    const sql = sqlWithSubscriptions([SUB])
    const gone = Object.assign(new Error('Gone'), { statusCode: 410 })

    const report = await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', stubSend(gone))

    expect(report.pruned).toBe(1)
    expect(report.delivered).toBe(0)
    const [update] = sent(sql, /update push_subscriptions/)
    expect(update?.text).toMatch(/failure_count = failure_count \+ 1/)
    expect(update?.text).toMatch(/revoked_at = case when/)
    expect(update?.values).toContain(true)
  })

  it('a socket fault is retryable and the subscription is kept', async () => {
    withVapid()
    const sql = sqlWithSubscriptions([SUB])

    const report = await sendWorkerPush(
      sql,
      USER,
      BUBBLE,
      'worker_photo_delivered',
      stubSend(new Error('ECONNRESET')),
    )

    expect(report.retryable).toBe(1)
    expect(report.pruned).toBe(0)
    const [update] = sent(sql, /update push_subscriptions/)
    expect(update?.values).toContain(false)
  })

  it('the fifth consecutive failure revokes even with no terminal status', async () => {
    /* `shouldRevokeSubscription` is the app's own function, imported — PUSH_FAILURE_LIMIT appears
     * nowhere in the worker. This is the assertion that proves it, because getting the threshold
     * from a second copy would be invisible everywhere else. */
    withVapid()
    const sql = sqlWithSubscriptions([{ ...SUB, failure_count: 4 }])

    const report = await sendWorkerPush(
      sql,
      USER,
      BUBBLE,
      'worker_photo_delivered',
      stubSend(new Error('ETIMEDOUT')),
    )

    expect(report.pruned).toBe(1)
    expect(sent(sql, /update push_subscriptions/)[0]?.values).toContain(true)
  })

  it('one subscription’s failure does not stop the next — a phone and a laptop are two rows', async () => {
    withVapid()
    const second = { ...SUB, id: 'sub000000002', endpoint: 'https://fcm.googleapis.com/xyz' }
    const sql = sqlWithSubscriptions([SUB, second])
    const send = vi.fn<SendWorkerNotification>(async (subscription) => {
      if (subscription.endpoint === SUB.endpoint) throw new Error('ECONNRESET')
      return { statusCode: 201 }
    })

    const report = await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', send)

    expect(report.attempted).toBe(2)
    expect(report.delivered).toBe(1)
    expect(report.retryable).toBe(1)
  })

  it('an unreadable push_subscriptions degrades to a skip and never throws', async () => {
    /* The reason that table is absent from preflight's REQUIRED_COLUMNS: a notification drift must
     * surface as one log line, not as a red workflow that never claims the job it exists to
     * rescue. */
    withVapid()
    const sql = sqlWithSubscriptions([SUB], { failOn: /from push_subscriptions/ })
    const send = stubSend()

    const report = await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', send)

    expect(report.skipped).toMatch(/subscriptions unreadable/)
    expect(send).not.toHaveBeenCalled()
  })

  it('a bookkeeping fault after a delivered push does not turn it into a failure', async () => {
    /* The one place this file deliberately does NOT mirror `sendPushToSubscription`, which keeps
     * `recordPushSuccess` inside the send's `try` and would increment the failure streak of a
     * subscription that just worked. */
    withVapid()
    const sql = fakeSql({
      failOn: /update push_subscriptions/,
      rows: (call) => (/from push_subscriptions/.test(call.text) ? [SUB] : []),
    })

    const report = await sendWorkerPush(sql, USER, BUBBLE, 'worker_photo_delivered', stubSend())

    expect(report.delivered).toBe(1)
    expect(report.retryable).toBe(0)
    expect(report.pruned).toBe(0)
  })
})

/**
 * The call site: `finishSelfie` notifies, and nothing it does to the notification can cost the
 * photograph. Separate from the `finishSelfie — Finding 1` block above so that block's nine cases
 * keep passing four arguments, which is also the proof the new parameter's default works.
 */
describe('finishSelfie — the push (nina-push-every-message R1)', () => {
  const image = {
    blobUrl: 'https://blob/x.png',
    pathname: 'nina/u/selfie-x.png',
    bytes: 1234,
    contentHash: null as string | null,
    duplicateOf: null,
  }
  const result = { costMicroUsd: 40_000, latencyMs: 78_200 }
  const NO_PUSH: WorkerPushReport = {
    attempted: 0,
    delivered: 0,
    pruned: 0,
    retryable: 0,
    skipped: 'test',
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('notifies once, with the caption it actually wrote and this host’s own kind', async () => {
    const sql = sqlResolving(SESSION_ID)
    const notify = vi.fn<WorkerNotifier>(async () => NO_PUSH)

    await finishSelfie(sql, jobFixture(), image, result, notify)

    expect(notify).toHaveBeenCalledTimes(1)
    const [, userId, messages, kind] = notify.mock.calls[0]!
    expect(userId).toBe('user00000001')
    /* NOT `lib/nina/imagerun.ts`'s `'photo_delivered'`. The two hosts stamp DIFFERENT kinds for
     * the same event on purpose: this worker only runs when the app's own invocation was killed,
     * so the `worker_` prefix is the one thing in a log line that says the backstop delivered this
     * photograph. Collapsing them would make the diagnostic vacuous. */
    expect(kind).toBe('worker_photo_delivered')
    /* The body is the string the INSERT bound, not a second `ninaImageCaption` call that happens
     * to agree. */
    const [insert] = sent(sql, /insert into nina_messages/)
    expect(insert?.values).toContain(messages[0]?.body)
    expect(messages).toHaveLength(1)
  })

  it('sends only after the message row, the image row and the ok close are all in', async () => {
    /* A notification for a photograph that is not in the chat yet is the worst outcome available
     * here: the tap opens an empty frame. */
    const sql = sqlResolving(SESSION_ID)
    let statementsAtNotify = -1
    const notify = vi.fn<WorkerNotifier>(async () => {
      statementsAtNotify = sql.calls.length
      return NO_PUSH
    })

    await finishSelfie(sql, jobFixture(), image, result, notify)

    expect(sent(sql, /insert into nina_messages/)).toHaveLength(1)
    expect(sent(sql, /insert into nina_message_images/)).toHaveLength(1)
    expect(sent(sql, /set status = 'ok'/)).toHaveLength(1)
    /* Nothing runs after the notify, so every statement the function sends was already sent when
     * it fired. */
    expect(statementsAtNotify).toBe(sql.calls.length)
  })

  it('a notifier that throws leaves the photograph, its image row and the closed job alone', async () => {
    /* Plan invariant 2, and Finding 1's blast radius restated: a throw here would send `runOneJob`
     * into `closeFailed`, which would mark a DELIVERED generation failed and apologise for a
     * picture he can already see. */
    const sql = sqlResolving(SESSION_ID)
    const notify = vi.fn<WorkerNotifier>(async () => {
      throw new Error('push service on fire')
    })

    await expect(finishSelfie(sql, jobFixture(), image, result, notify)).resolves.toBeUndefined()

    expect(sent(sql, /insert into nina_messages/)).toHaveLength(1)
    expect(sent(sql, /insert into nina_message_images/)).toHaveLength(1)
    expect(sent(sql, /set status = 'ok'/)).toHaveLength(1)
  })

  it('does not notify when no session resolves, because no message was written', async () => {
    const sql = sqlResolving(null)
    const notify = vi.fn<WorkerNotifier>(async () => NO_PUSH)

    await expect(finishSelfie(sql, jobFixture(), image, result, notify)).rejects.toThrow(
      /no session/,
    )

    expect(notify).not.toHaveBeenCalled()
  })
})

/**
 * `closeFailed` — R22's apology on this host, and the last uncovered `nina_messages` write in the
 * plan set (reconciler ruling; see Step 2f). The in-platform twin is
 * `lib/nina/imagejobs.ts`'s `postNinaApologyMessage`, which phase 3 pushes as `'photo_apology'`.
 * This host stamps `'worker_photo_apology'`, deliberately — see `finishSelfie`'s header.
 *
 * The existing `closeFailed` cases above pass three arguments and still do, which is the proof the
 * new parameter's default works.
 */
describe('closeFailed — the apology push (nina-push-every-message R1)', () => {
  const GAVE_UP = { kind: 'timeout' as const, latencyMs: 78_000, detail: 'x', costMicroUsd: null }
  const NO_PUSH: WorkerPushReport = {
    attempted: 0,
    delivered: 0,
    pruned: 0,
    retryable: 0,
    skipped: 'test',
  }

  /** A job at the attempt ceiling, so `closeFailed` gives up rather than queueing a retry. */
  function spentJob(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
    return { ...jobFixture(), attempts: NINA_IMAGE_MAX_ATTEMPTS, ...overrides } as ClaimedJob
  }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('pushes the apology it wrote, with the id the row carries and the worker kind', async () => {
    const sql = sqlResolving(SESSION_ID)
    const notify = vi.fn<WorkerNotifier>(async () => NO_PUSH)

    await expect(closeFailed(sql, spentJob(), GAVE_UP, notify)).resolves.toBe('gave-up')

    expect(notify).toHaveBeenCalledTimes(1)
    const [, , messages, kind] = notify.mock.calls[0]!
    /* NOT phase 3's `'photo_apology'`: the two hosts keep separate kinds so a log line can say
     * which one gave the photograph up. */
    expect(kind).toBe('worker_photo_apology')
    /* Both the id and the sentence are the INSERT's own bound values, not a second draw. */
    const [insert] = sent(sql, /insert into nina_messages/)
    expect(insert?.values).toContain(messages[0]?.id)
    expect(insert?.values).toContain(messages[0]?.body)
  })

  it('pushes only after the job is closed failed, never while it is still pending', async () => {
    const sql = sqlResolving(SESSION_ID)
    let statementsAtNotify = -1
    const notify = vi.fn<WorkerNotifier>(async () => {
      statementsAtNotify = sql.calls.length
      return NO_PUSH
    })

    await closeFailed(sql, spentJob(), GAVE_UP, notify)

    expect(sent(sql, /set status = 'failed'/)).toHaveLength(1)
    expect(statementsAtNotify).toBe(sql.calls.length)
  })

  it('a retry says nothing — there is nothing to apologise for yet', async () => {
    const sql = sqlResolving(SESSION_ID)
    const notify = vi.fn<WorkerNotifier>(async () => NO_PUSH)

    await expect(
      closeFailed(sql, { ...jobFixture(), attempts: 1 } as ClaimedJob, GAVE_UP, notify),
    ).resolves.toBe('retry')

    expect(sent(sql, /insert into nina_messages/)).toHaveLength(0)
    expect(notify).not.toHaveBeenCalled()
  })

  it('an AVATAR job says nothing — nobody asked for one in the chat', async () => {
    const sql = sqlResolving(SESSION_ID)
    const job = spentJob()
    const notify = vi.fn<WorkerNotifier>(async () => NO_PUSH)

    await closeFailed(sql, { ...job, args: { ...job.args, purpose: 'avatar' } } as ClaimedJob, GAVE_UP, notify)

    expect(notify).not.toHaveBeenCalled()
  })

  it('says nothing when no session resolved, because no apology row was written', async () => {
    const sql = sqlResolving(null)
    const notify = vi.fn<WorkerNotifier>(async () => NO_PUSH)

    await expect(closeFailed(sql, spentJob(), GAVE_UP, notify)).resolves.toBe('gave-up')

    expect(sent(sql, /insert into nina_messages/)).toHaveLength(0)
    expect(notify).not.toHaveBeenCalled()
    /* The job is still closed. A missing apology never costs the ledger. */
    expect(sent(sql, /set status = 'failed'/)).toHaveLength(1)
  })

  it('a notifier that throws still closes the job and still returns gave-up', async () => {
    /* Plan invariant 2, and this function's own header: a throw here is what once killed the
     * process before the money was recorded. The notify's `try` is separate from the apology
     * write's, so this failure cannot be logged as "the apology could not be written" either. */
    const sql = sqlResolving(SESSION_ID)
    const notify = vi.fn<WorkerNotifier>(async () => {
      throw new Error('push service on fire')
    })

    await expect(closeFailed(sql, spentJob(), GAVE_UP, notify)).resolves.toBe('gave-up')

    expect(sent(sql, /insert into nina_messages/)).toHaveLength(1)
    expect(sent(sql, /set status = 'failed'/)).toHaveLength(1)
  })
})
```

**Impact:** twenty-two new cases. The existing `finishSelfie — Finding 1` block still calls
`finishSelfie` with four arguments and still passes — with no `VAPID_*` in the vitest environment the
real `sendWorkerPush` returns `skipped` before reading anything, so those nine cases reach no network
and their `sql.calls` assertions are unaffected.

**Verified, not assumed:** `.env.local` is **not** loaded into `process.env` by vitest.
`vitest.config.ts` has no env loading and `tests/support/setup.ts` sets only seven named dummies,
none of them `VAPID_*`; `.env.local` is read exclusively by `tests/live/loadEnvLocal.ts`, which the
default run excludes. Plan invariant 7 therefore holds for free.

---

## Verification

Run everything from the worktree root, `/home/miftah/.worktrees/run-insights/nina-push-every-message`
(it already has `.env.local` and a real `npm install`).

**Build / typecheck:** `npm run typecheck`
(`next typegen && tsc --noEmit`; `npx tsc --noEmit` alone is the fallback if typegen is unavailable —
it is the half that matters here, since `tsconfig.json` includes `**/*.ts` and therefore typechecks
both new and edited worker modules). **This is the gate that catches a wrong `NinaPushKind`
literal**: a `'worker_photo_delivered'` outside phase 1's union is an error at `finish.ts`'s call site. Do not
widen `WorkerNotifier`'s `kind` to `string` to make a guess compile.

**Lint:** `npm run lint`
**Format (CI runs it):** `npm run format:check`
**Tests:** `npm test`, or focused: `npx vitest run tests/nina.imageworker.test.ts`

**This is also the gate that catches a `'worker_photo_apology'` typo** at `closeFailed`'s call site,
for the same reason: `WorkerNotifier`'s `kind` is `NinaPushKind`.

**The gate that is specific to this phase, and that none of the above provides.** `tsc` and `vitest`
both resolve modules with their own resolvers; neither proves the file loads under
`node --experimental-strip-types`, which is the only runtime this code ever has:

```
npm run nina:worker:dry
```

`main` imports `run.ts` imports `finish.ts` imports `push.ts`, so a dry run loads the whole chain. It
runs preflight and exits without claiming, generating or writing. **Baseline measured on this
worktree before the phase:** `[nina-worker] preflight ok { jobId: null, mode: 'sweep' }`. The same
line after the phase means the new module, its `createRequire('web-push')` and its
`../../lib/push/payload.ts` import all resolve on the runtime the workflow uses.

A narrower version of the same proof, if the database is unavailable:

```
node --experimental-strip-types --no-warnings --input-type=module \
  -e "import('./scripts/nina-image-worker/push.ts').then(m => console.log(Object.keys(m)))"
```

**Workflow parses:**

```
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/nina-image.yml')); print('yaml ok')"
```

**Manual check — the real one, and it writes production.** `npm run nina:worker -- --job <jobId>`
runs with `--env-file=.env.local`, and `.env.local` **does** carry all three `VAPID_*` values. So a
manual drain from this laptop exercises the full path — real subscriptions, a real signed POST, a
real buzz on the XS Max — without waiting for the GitHub secrets to exist. Two cautions: this repo
has ONE database and `.env.local` points at the instance production reads, so it finishes a real job
and writes real rows; and it needs a genuinely stuck `pending` selfie job to have anything to do.

**Exit criteria:**

1. A photograph finished by `finishSelfie` on this host sends exactly one push carrying the same
   caption the bubble carries, with `kind: 'worker_photo_delivered'`, after the message row, the
   image row and the `ok` close are all committed.
2. **A photograph this host GIVES UP on sends exactly one push carrying the apology row it wrote**,
   with `kind: 'worker_photo_apology'`, after the terminal `status = 'failed'` update. A retry, an
   avatar job, an unresolvable session and a failed apology INSERT each send nothing, and each still
   closes the job.
3. Neither kind collides with phase 3's `'photo_delivered'` / `'photo_apology'` — the two hosts are
   separable in a log line, which is the whole reason `kind` exists.
4. With no `VAPID_*` in the environment the run still finishes the photograph, still closes the job,
   and exits 0, logging one `skipped` line — and `npm run nina:worker:dry` still prints
   `preflight ok`.
5. A `410` prunes the subscription; a socket fault does not; the fifth consecutive failure does.
6. `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test` all pass, and
   `tests/nina.imageworker.test.ts`'s pre-existing cases are unchanged and still green — including
   the ones that call `finishSelfie` with four arguments and `closeFailed` with three, which is the
   proof both new parameters' defaults work.
7. The workflow file parses and its `run:` steps, npm pin, concurrency block and schedule are
   byte-identical to before.

---

## The ops step this phase cannot perform

**Three GitHub repository secrets must be added by the repository owner**, at
*Settings -> Secrets and variables -> Actions*:

| Secret | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | the same value as the Vercel **Production** environment |
| `VAPID_PRIVATE_KEY` | the same value as the Vercel **Production** environment |
| `VAPID_SUBJECT` | the same value as the Vercel **Production** environment |

They must match Production byte for byte: a push is signed for one VAPID key pair, and a runner
signing with a different pair is refused by the push service for every subscription the app
registered. The memory note *vercel-preview-cannot-serve-admin* records that `VAPID_*` is
Production-scope only on Vercel, so Preview is not the place to read them from.

**Nothing fails while they are missing.** An undefined secret interpolates to the empty string, the
worker reads that as "no VAPID", logs `skipped: 'VAPID not configured'` and returns; the photograph
is written, the job is closed `ok`, the run exits 0. This mirrors plan invariant 4 and exactly what
`sendNinaPush` already does in the app. It is stated in the workflow's own comment (step 3) and must
be repeated in this phase's final report.

---

## Handoffs

1. **The worker's apology — ASSIGNED TO THIS PHASE, no longer a handoff.** `closeFailed`
   (`finish.ts:262–327`) writes R22's apology on this host, the off-platform twin of
   `postNinaApologyMessage` which phase 3 pushes as `'photo_apology'`. This plan originally reported
   it as an unowned gap; the reconciler assigned it here, because this phase owns the file, has
   already built the seam, and it is ~8 lines. **It is now Step 2f** — call site, kind, never-throw
   wrapper and six test cases — and it is the last uncovered `nina_messages` write in the set.
   Nothing is handed off.
2. **`lib/push/send.ts` records a failure against a subscription that just succeeded — OBSERVED,
   DELIBERATELY NOT FIXED IN THIS SET.** `sendPushToSubscription` (`send.ts:93–131`) keeps
   `recordPushSuccess` inside the send's `try`, so a database fault after a delivered notification
   is classified as a retryable *send* failure and increments the streak of a subscription that just
   worked. It is a real pre-existing defect and it is **out of scope**: phase 1's stated scope is
   that it changes no existing behaviour, and putting an unrelated bugfix inside the foundation
   every other phase depends on would widen the one phase nobody can revert independently. Recorded
   in the plan index's **Decisions** table as deferred; it wants its own card.

   **This phase's `push.ts` splits the two `try`s (Step 1) because that file is NEW CODE and getting
   it right there costs three lines.** That is not a fix to be mirrored into `lib/push/send.ts` by
   this plan set, and no phase file proposes one. Do not "align" phase 1 to it.
3. **`push_subscriptions` is deliberately not in `preflight.ts`'s `REQUIRED_COLUMNS`.** Every other
   table the worker names is, so a rename takes the workflow red before a cent is spent. Adding this
   one would make a drift in a *notification* table abort the backstop before it claims the job it
   exists to rescue, which inverts the phase's own rule. The mitigation is in step 4b: the test pins
   all five column names against the statement the module builds. **Do not "fix" this for
   consistency** without changing what a `preflight` failure costs.
4. **`web-push` is not in `preflight.ts`'s `REQUIRED_ENV` either**, for the same reason, and neither
   are the three `VAPID_*` names. `preflight` guards the three things a generation cannot happen
   without; a notification is not one of them.
5. **The worker's `finishAvatar` stays silent.** It writes no `nina_messages` row — *"Nobody asked in
   chat"* — so there is nothing to notify about, and `avatar_changed` already reaches the phone
   through `lib/nina/proactive.ts`. This matches phase 3's identical decision for the in-platform
   `finishAvatar`. No work, recorded so nobody adds it later thinking it was missed.

---

## Rollback

`git revert` of this phase's commit, alone and in any order relative to phases 2, 3 and 4. It adds a
file, two defaulted parameters (`finishSelfie`'s and `closeFailed`'s), two calls, the hoisted
caption and the hoisted apology id/text, and three YAML lines; it removes nothing, changes no schema, changes no wire format
(`NinaPushPayload.v` stays `1`) and alters no existing signature in a way a caller can see —
`run.ts` passes four arguments to `finishSelfie` and three to `closeFailed` before and after, and is
not edited either way.

The one ordering constraint is against **phase 1**: reverting phase 1 while this phase stands leaves
`import type { NinaPushKind } from '../../lib/push/payload.ts'` unresolvable and `tsc --noEmit` red,
which is why the plan index's whole-set rollback is 5 -> 1 in that order.

The three repository secrets, once added, are harmless to leave in place after a revert — nothing
reads them — but they can be deleted from *Settings -> Secrets and variables -> Actions* if the
feature is abandoned.

A runner who wants the old silence back without a deploy or a revert turns notifications off on
`/me`, which deletes the subscription row and makes `sendWorkerPush` return
`skipped: 'no live subscriptions'` on every run.
