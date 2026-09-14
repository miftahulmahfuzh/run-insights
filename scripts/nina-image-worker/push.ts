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
