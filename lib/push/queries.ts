import 'server-only'
import { and, count, eq, isNull, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { pushSubscriptions } from '@/lib/db/schema'
import { newId } from '@/lib/id'
import {
  shouldRevokeSubscription,
  type PushFailureVerdict,
  type PushSubscriptionInput,
} from './payload'

/**
 * The whole of `push_subscriptions`' read/write surface. Phase 1 shipped the table with no
 * functions on purpose so that this phase — the only thing in the app with an opinion about
 * VAPID — owns them all.
 *
 * ── WHY HERE AND NOT `lib/db/queries.ts` ──────────────────────────────────────────────────────
 * `scripts/check-data-layer-invariants.mjs` parses that file and would pass these either way:
 * every function below takes `userId` first and scopes on it (invariant 7). The reason is
 * vocabulary. Phase 1 put Nina's reads in `lib/nina/queries.ts` rather than the shared module, and
 * push is a third bounded context — endpoints, VAPID, revocation. `lib/db/queries.ts` is 1500
 * lines of run and badge and record vocabulary and this does not belong in it.
 *
 * **Every function takes `userId` first and scopes on it, including the ones keyed by a globally
 * unique endpoint.** `endpoint` is unique by RFC 8030, so `WHERE endpoint = $1` alone would be
 * correct — and it is still wrong to write, because it is an unscoped write against a shared table
 * and the next such function will not have the uniqueness argument going for it.
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
 * A runner tapping "Turn off" is a decision, and it DELETES. Keeping a tombstone of a choice the
 * runner made explicitly would mean "off" is a state the database still holds an endpoint for, and
 * there is no forensic question that justifies it.
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
 * and on a laptop is two subscriptions, and a design that stored one would make installing the PWA
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
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
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
 *
 * `failureCount` is a required fourth parameter rather than a re-read of the row, because the
 * sender already holds it from `listLivePushSubscriptions`. A future caller that does not must
 * SELECT first — **do not add a default of `0`**, which would silently disable the
 * consecutive-failure ceiling.
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
