import 'server-only'
import { WebPushError, sendNotification, setVapidDetails } from 'web-push'

import { pushEnv } from '@/lib/env'
import type { ProactiveNotifier } from '@/lib/nina/proactive'
import {
  buildNinaPushPayload,
  classifyPushFailure,
  encodeNinaPushPayload,
  shouldRevokeSubscription,
  type NinaPushKind,
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
 *
 * ── NAMED IMPORTS, NOT A DEFAULT ──────────────────────────────────────────────────────────────
 * `@types/web-push` declares only named exports — there is no `export default` and no `export =`,
 * so `import webpush from 'web-push'` does not typecheck here even with `esModuleInterop`.
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
  setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
  vapidConfigured = true
}

interface PushSendReport {
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

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return 'unparseable'
  }
}

/**
 * One subscription, one attempt. Returns the verdict rather than throwing, because the fan-out's
 * job is to keep going.
 *
 * The `pruned` verdict is decided by `shouldRevokeSubscription` — **the same call
 * `recordPushFailure` makes**, not a second threshold spelled out here. There is exactly one
 * function in this phase that decides whether a subscription is dead, and the report agrees with
 * the database because both ask it.
 */
async function sendPushToSubscription(
  userId: string,
  subscription: LivePushSubscription,
  payload: NinaPushPayload,
): Promise<'delivered' | 'pruned' | 'retryable'> {
  configureVapid()
  try {
    await sendNotification(
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
    const revoked = shouldRevokeSubscription({ verdict, failureCount: subscription.failureCount })
    await recordPushFailure(userId, subscription.id, verdict, subscription.failureCount)

    /* Logged, never rethrown. The endpoint is reduced to its host because it is 300 characters of
     * which the host is the only informative part. */
    console.warn('[push] send failed', {
      userId,
      subscriptionId: subscription.id,
      host: hostOf(subscription.endpoint),
      statusCode,
      verdict,
      failureCount: subscription.failureCount,
    })

    return revoked ? 'pruned' : 'retryable'
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
 * successful turn look like a failed one. Phase 10 wraps the call in its own `try` as well; this
 * is the belt to that brace, and it is what makes a deployment with no VAPID keys behave as "no
 * notifications" instead of "a warning per turn".
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
 * ── THE SEAM EVERY MESSAGE WRITER CALLS ───────────────────────────────────────────────────────
 * `sendNinaPush` above is the mechanism; this is the door. Four modules outside `lib/push` are
 * about to knock on it — the chat turn, the delivered photograph, R22's apology and the `/admin`
 * chat photo — and all four are in the same position: the rows are already committed, the
 * notification is a courtesy, and nothing they do afterwards may depend on it.
 *
 * ── WHY NOT JUST EXPORT `pushNotifier` AND BE DONE ────────────────────────────────────────────
 * Because `pushNotifier` is declared `satisfies ProactiveNotifier`, which INFERS its `kind`
 * parameter as `ProactiveTriggerKind`. `pushNotifier(userId, bubbles, 'chat_reply')` is a compile
 * error, and widening `ProactiveNotifier` to fix that would edit `lib/nina/proactive.ts` — the one
 * file this plan set may not touch, because it is already correct and is the pattern the other
 * four writers copy. This function takes the wider `NinaPushKind` instead and leaves that file
 * alone.
 *
 * ── IT SWALLOWS, AND THAT IS NOT BELT-AND-BRACES ──────────────────────────────────────────────
 * `sendNinaPush` catches the VAPID failure and every per-subscription failure, but
 * `listLivePushSubscriptions` is a database round trip OUTSIDE its `try` — a dropped connection
 * rejects straight out of it. Every caller is still expected to wrap this in its own `try`, the
 * way `proactive.ts:702` does; this `catch` is what makes forgetting survivable instead of turning
 * an unreachable phone into a failed turn.
 */
export type NinaPushNotifier = (
  userId: string,
  messages: ReadonlyArray<{ id: string; body: string }>,
  kind: NinaPushKind,
) => Promise<void>

/**
 * Annotated rather than `satisfies`, unlike `pushNotifier` below: the type it conforms to is
 * declared three lines up, so there is no other file for a mismatch to surface in, and the
 * annotation types the three parameters contextually instead of restating them.
 *
 * **Returns `void`, not the report.** A caller that branched on `delivered` would be making a
 * message's success depend on a phone's reachability, which is exactly the coupling invariant 2
 * forbids. The numbers go to the log line, which is the only consumer they have ever had.
 */
export const notifyNinaPush: NinaPushNotifier = async (userId, messages, kind) => {
  try {
    const report = await sendNinaPush(userId, messages, kind)
    console.info('[push] notified', { userId, kind, ...report })
  } catch (cause) {
    /* The message row is already committed and the caller has already moved on: there is nothing
     * to retry against and nobody left to tell. This line is the whole of the error handling, and
     * it is deliberate. */
    console.warn('[push] notify failed', { userId, kind, error: String(cause) })
  }
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
  /* ── THE SUBSET PIN, AND WHY IT IS AN ANNOTATION AND NOT A COMMENT ─────────────────────────
   * `kind` here is `ProactiveTriggerKind` (inferred from the `satisfies` below), and
   * `NINA_PUSH_KINDS` in `payload.ts` spells those five trigger names out by hand because that
   * module may not import from `lib/nina/*` — phase 5's off-platform worker loads it through a
   * relative specifier under `node --experimental-strip-types` and cannot resolve `@/`.
   *
   * This annotation is what stops the two lists drifting. Add a sixth trigger to
   * `ProactiveTriggerKind` without adding it to `NINA_PUSH_KINDS` and `npx tsc --noEmit` fails
   * HERE, at the only seam that knows about both. It is erased at runtime: `sendNinaPush` receives
   * exactly the string it received before. */
  const pushKind: NinaPushKind = kind
  const report = await sendNinaPush(userId, messages, pushKind)
  console.info('[push] notified', { userId, kind, ...report })
}) satisfies ProactiveNotifier
