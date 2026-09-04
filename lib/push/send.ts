import 'server-only'
import { WebPushError, sendNotification, setVapidDetails } from 'web-push'

import { pushEnv } from '@/lib/env'
import type { ProactiveNotifier } from '@/lib/nina/proactive'
import {
  buildNinaPushPayload,
  classifyPushFailure,
  encodeNinaPushPayload,
  shouldRevokeSubscription,
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
export async function sendPushToSubscription(
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
