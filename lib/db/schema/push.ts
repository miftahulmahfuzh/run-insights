import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { users } from './auth'
/**
 * **DECLARATION ONLY — phase 11 owns every write against this table.** It is here because a
 * migration per phase is a migration per phase, and because phase 11's exit criteria are about
 * VAPID and a service worker rather than about DDL.
 *
 * The shape is the Web Push subscription as `PushSubscription.toJSON()` gives it, flattened:
 * `endpoint` plus the two `keys` fields. `endpoint` is globally unique by spec, so it gets a
 * unique index — but the PK stays a nanoid, because an endpoint is a 300-character URL and a
 * 300-character primary key is a 300-character foreign key everywhere it is referenced.
 *
 * `failure_count` and `revoked_at` are the pruning story: a browser that has revoked its
 * subscription answers 404/410 to every send, and a sender that does not record that will retry
 * forever. Phase 11 decides the threshold.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    /** nanoid(12) — lib/id.ts newId(). */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    /** `keys.p256dh` — the client's public key, base64url. */
    p256dh: text('p256dh').notNull(),
    /** `keys.auth` — the client's auth secret, base64url. */
    auth: text('auth').notNull(),
    /** Which browser this is, so a stale subscription is identifiable by a human. */
    userAgent: text('user_agent'),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true, mode: 'date' }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true, mode: 'date' }),
    failureCount: integer('failure_count').notNull().default(0),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    /** One row per browser endpoint. Re-subscribing upserts on this. */
    uniqueIndex('push_subscriptions_endpoint_unq').on(t.endpoint),
    /** "every live subscription for this user" — the send fan-out. */
    index('push_subscriptions_user_idx').on(t.userId),
  ],
)

/**
 * `PushSubscriptionRow`, not `PushSubscription` — the latter is a DOM lib global that phase 11's
 * client code uses by that exact name, and shadowing it in a module that also talks to the
 * browser API is how a subscription gets written to the wrong shape.
 */
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert
