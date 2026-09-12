import { neonConfig } from '@neondatabase/serverless'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * `recordPushSuccess` / `recordPushFailure` — the two write paths of the push pruning story —
 * against a REAL Postgres.
 *
 *     TEST_DATABASE_URL=<pooled url> npx vitest run tests/integration/pushQueries.int.test.ts
 *
 *     # with VITEST_INTEGRATION=1, or: TEST_DATABASE_URL=<pooled url> npm run test:int
 *
 * Skipped entirely without `TEST_DATABASE_URL`, so a plain `npm test` never touches a database.
 * `lib/push/payload.test.ts` already covers `shouldRevokeSubscription`'s arithmetic; what a unit
 * test CANNOT prove, and what needs the database, is:
 *
 *   - `failure_count = failure_count + 1` really is evaluated in SQL — two concurrent failures
 *     land as 2, not 1. A read-then-write in TypeScript is the exact regression this catches,
 *     and no fake driver serializes concurrent statements the way the server does.
 *   - the ceiling composes with the caller's LAGGING count: `sendPushToSubscription` passes the
 *     `failureCount` it read from `listLivePushSubscriptions`, one behind under a race, and the
 *     fifth consecutive retry must still revoke.
 *   - a `timestamptz` instant survives the neon-HTTP round trip at millisecond fidelity, and
 *     `lastFailureAt`'s clearing is a real NULL rather than a fake's absent field.
 *   - "it is one statement" is true — one HTTP round trip per call, since the sender runs this
 *     once per subscription per send.
 *   - the userId-first scoping (queries.ts header, invariant 7) makes a cross-user record a
 *     silent no-op: even a `'gone'` verdict from the wrong user cannot revoke someone's row.
 *
 * ── HOW TO GET A `TEST_DATABASE_URL` (the disposable scratch database) ────────────────────────
 * Same recipe `ninaImageE2E.int.test.ts` documents: a separate DATABASE on the same endpoint,
 * swapped by an anchor that cannot match the `/neondb` inside the `neondb_owner` USERNAME:
 *
 *     UNPOOLED=$(grep -E '^DATABASE_URL_UNPOOLED=' .env.local | head -1 | cut -d= -f2- | awk '{print $1}')
 *     POOLED=$(grep -E '^DATABASE_URL=' .env.local | head -1 | cut -d= -f2- | awk '{print $1}')
 *     swap() { printf '%s' "$1" | sed -E 's#^(postgresql://[^/?]+)/[^?]+(\?.*)$#\1/run_insights_itest_push\2#'; }
 *     psql "$UNPOOLED" -c 'CREATE DATABASE run_insights_itest_push'
 *     DATABASE_URL_UNPOOLED="$(swap "$UNPOOLED")" npm run db:migrate
 *     VITEST_INTEGRATION=1 TEST_DATABASE_URL="$(swap "$POOLED")" npm run test:int
 *     psql "$UNPOOLED" -c "select pg_terminate_backend(pid) from pg_stat_activity
 *                          where datname='run_insights_itest_push'"
 *     psql "$UNPOOLED" -c 'DROP DATABASE run_insights_itest_push'
 *
 * The terminate is not optional: the pooler holds connections open and `DROP DATABASE` fails
 * without it.
 */

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const enabled = Boolean(TEST_DATABASE_URL)

// lib/db/index.ts reads DATABASE_URL at import time, so it must be pointed at the test database
// BEFORE the dynamic imports below. Same ordering rule as queries.int.test.ts.
if (enabled) process.env.DATABASE_URL = TEST_DATABASE_URL

/** Counts real HTTP round trips — "one statement" is a claim about these, not about SQL text. */
let httpRequests = 0
const realFetch = globalThis.fetch
neonConfig.fetchFunction = (input: unknown, init: unknown) => {
  httpRequests++
  return realFetch(input as string, init as RequestInit)
}

const SUFFIX = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const U1 = `pushtest-u1-${SUFFIX}`
const U2 = `pushtest-u2-${SUFFIX}`

type Db = (typeof import('@/lib/db/index'))['db']
type Schema = typeof import('@/lib/db/schema')
/* Type-only exports are not visible through indexed access on `typeof import(...)` (measured:
 * TS2339), so the two row shapes take the qualified form. */
type NewPushSubscriptionRow = import('@/lib/db/schema').NewPushSubscriptionRow
type PushSubscriptionRow = import('@/lib/db/schema').PushSubscriptionRow
type PushQueries = typeof import('@/lib/push/queries')

let db: Db
let s: Schema
let pq: PushQueries

/** Neat, distinct, millisecond-carrying instants — every timestamp assertion is exact. */
const T0 = new Date('2026-09-12T03:40:00.000Z')
const T1 = new Date('2026-09-12T03:41:00.123Z')
const T2 = new Date('2026-09-12T03:42:00.456Z')

describe.skipIf(!enabled)('push subscription recording against a real database', () => {
  /** A row whose seed state the test names explicitly, so what changed is always attributable. */
  async function seedSub(
    userId: string,
    name: string,
    overrides: Partial<NewPushSubscriptionRow> = {},
  ): Promise<string> {
    const id = `push-${name}-${SUFFIX}`
    await db.insert(s.pushSubscriptions).values({
      id,
      userId,
      endpoint: `https://fcm.googleapis.com/fcm/send/${SUFFIX}-${name}`,
      p256dh: `p256dh-${name}`,
      auth: `auth-${name}`,
      ...overrides,
    })
    return id
  }

  async function rowOf(id: string): Promise<PushSubscriptionRow> {
    const rows = await db.select().from(s.pushSubscriptions).where(eq(s.pushSubscriptions.id, id))
    expect(rows).toHaveLength(1)
    return rows[0]!
  }

  beforeAll(async () => {
    db = (await import('@/lib/db/index')).db
    s = await import('@/lib/db/schema')
    pq = await import('@/lib/push/queries')

    // Deleting these in afterAll cascades every push_subscriptions row away (FK, ON DELETE
    // CASCADE) — the same one-delete cleanup queries.int.test.ts relies on.
    await db.insert(s.users).values([
      { id: U1, name: 'Push Fixture Runner', email: `${U1}@example.test` },
      { id: U2, name: 'Push Someone Else', email: `${U2}@example.test` },
    ])
  }, 60_000)

  afterAll(async () => {
    if (!enabled) return
    await db.delete(s.users).where(sql`${s.users.id} in (${U1}, ${U2})`)
  }, 60_000)

  describe('recordPushSuccess', () => {
    it('writes last_success_at at the exact instant, zeroes failure_count and clears last_failure_at', async () => {
      // Seeded mid-streak: three failures, the last one at T0, never yet a success.
      const id = await seedSub(U1, 'success', {
        failureCount: 3,
        lastFailureAt: T0,
      })

      await pq.recordPushSuccess(U1, id, T1)

      const row = await rowOf(id)
      expect(row.failureCount).toBe(0)
      expect(row.lastFailureAt).toBeNull()
      expect(row.lastSuccessAt?.getTime()).toBe(T1.getTime())
      expect(row.revokedAt).toBeNull()
    })

    it('defaults the instant to now, which is how the sender actually calls it', async () => {
      // send.ts omits `at` on both the success and the failure path; the default is not
      // decorative, so the window assertion runs the real `new Date()` branch.
      const id = await seedSub(U1, 'success-default')
      const before = new Date()

      await pq.recordPushSuccess(U1, id)

      const after = new Date()
      const row = await rowOf(id)
      expect(row.lastSuccessAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(row.lastSuccessAt!.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('touches only the named subscription — a dropped `eq(id)` would zero the sibling too', async () => {
      const id = await seedSub(U1, 'success-a', { failureCount: 3, lastFailureAt: T0 })
      // A second subscription of the SAME user, mid-streak: the fan-out's realistic shape.
      const siblingId = await seedSub(U1, 'success-b', { failureCount: 3, lastFailureAt: T0 })

      await pq.recordPushSuccess(U1, id, T1)

      const sibling = await rowOf(siblingId)
      expect(sibling.failureCount).toBe(3)
      expect(sibling.lastFailureAt?.getTime()).toBe(T0.getTime())
      expect(sibling.lastSuccessAt).toBeNull()
    })

    it('is a silent no-op for a row that is not yours — the userId-first rule', async () => {
      // `endpoint` is unique, so `WHERE id = $1` alone would be "correct" — and it is still the
      // unscoped write the module header forbids. U2 naming U1's row must change nothing.
      const id = await seedSub(U1, 'scoped-success', { failureCount: 3, lastFailureAt: T0 })

      await pq.recordPushSuccess(U2, id, T1)

      const row = await rowOf(id)
      expect(row.failureCount).toBe(3)
      expect(row.lastFailureAt?.getTime()).toBe(T0.getTime())
      expect(row.lastSuccessAt).toBeNull()
    })

    it('is one HTTP round trip — the send fan-out runs this per subscription per send', async () => {
      const id = await seedSub(U1, 'success-rt')

      httpRequests = 0
      await pq.recordPushSuccess(U1, id, T1)

      expect(httpRequests).toBe(1)
    })
  })

  describe('recordPushFailure', () => {
    it('increments failure_count in SQL: two concurrent failures land as 2, not 1', async () => {
      // The comment on the function says the increment happens in SQL so that two concurrent
      // sends cannot both write "1". Only a real server evaluating `failure_count + 1` inside
      // two simultaneous UPDATEs proves it — a TypeScript read-modify-write writes 1 here.
      const id = await seedSub(U1, 'concurrent')

      await Promise.all([
        pq.recordPushFailure(U1, id, 'retry', 0, T1),
        pq.recordPushFailure(U1, id, 'retry', 0, T1),
      ])

      expect((await rowOf(id)).failureCount).toBe(2)
    })

    it("revokes immediately on a 'gone' verdict, whatever the count — and the row leaves the live list", async () => {
      const id = await seedSub(U1, 'gone', { failureCount: 0 })

      await pq.recordPushFailure(U1, id, 'gone', 0, T1)

      const row = await rowOf(id)
      expect(row.revokedAt?.getTime()).toBe(T1.getTime())
      // Soft delete for a dead endpoint (the module header): the row stays, the fan-out no
      // longer sees it. Reading through `listLivePushSubscriptions` proves both halves.
      const live = await pq.listLivePushSubscriptions(U1)
      expect(live.map((subscription) => subscription.id)).not.toContain(id)
    })

    it('revokes on the FIFTH consecutive retry and not before — with the caller count one behind', async () => {
      // `shouldRevokeSubscription` compares against count BEFORE this failure, while the SQL
      // writes count + 1. The realistic escalation: the sender re-lists between sends, so each
      // call passes the count the previous call left. Four retries survive; the fifth revokes.
      const id = await seedSub(U1, 'ceiling')

      for (let prior = 0; prior < 4; prior++) {
        const at = new Date(T0.getTime() + prior * 60_000)
        await pq.recordPushFailure(U1, id, 'retry', prior, at)
        const row = await rowOf(id)
        expect(row.revokedAt).toBeNull()
        expect(row.failureCount).toBe(prior + 1)
      }

      const fifthAt = new Date(T0.getTime() + 4 * 60_000)
      await pq.recordPushFailure(U1, id, 'retry', 4, fifthAt)

      const row = await rowOf(id)
      expect(row.failureCount).toBe(5)
      expect(row.revokedAt?.getTime()).toBe(fifthAt.getTime())
    })

    it('records the failure without erasing last_success_at — history and streak are different columns', async () => {
      // A subscription that succeeded once and then started failing: the success instant must
      // survive, exact to the millisecond, while the failure instant lands beside it.
      const id = await seedSub(U1, 'history', {
        failureCount: 1,
        lastSuccessAt: T0,
      })

      await pq.recordPushFailure(U1, id, 'retry', 1, T1)

      const row = await rowOf(id)
      expect(row.failureCount).toBe(2)
      expect(row.lastSuccessAt?.getTime()).toBe(T0.getTime())
      expect(row.lastFailureAt?.getTime()).toBe(T1.getTime())
      expect(row.revokedAt).toBeNull()
    })

    it('is a silent no-op for a row that is not yours — even a gone verdict cannot revoke it', async () => {
      // The sharpest scoping case: a cross-user recordPushFailure that matched would not just
      // corrupt a count, it would REVOKE someone else's subscription.
      const id = await seedSub(U1, 'scoped-failure', { failureCount: 1 })

      await pq.recordPushFailure(U2, id, 'gone', 99, T1)

      const row = await rowOf(id)
      expect(row.failureCount).toBe(1)
      expect(row.revokedAt).toBeNull()
      expect(row.lastFailureAt).toBeNull()
    })

    it('is one HTTP round trip — "the pruning is one statement" is a claim about round trips', async () => {
      const id = await seedSub(U1, 'failure-rt')

      httpRequests = 0
      await pq.recordPushFailure(U1, id, 'retry', 0, T1)

      expect(httpRequests).toBe(1)
    })
  })

  describe('the two together', () => {
    it('a success after failures clears the streak — consecutive is the whole word', async () => {
      // The payload.test.ts arithmetic and the SQL reset are two halves; this runs them in the
      // order production does: fail, fail, then deliver.
      const id = await seedSub(U1, 'streak', { failureCount: 2, lastFailureAt: T0 })

      await pq.recordPushFailure(U1, id, 'retry', 2, T1)
      expect((await rowOf(id)).failureCount).toBe(3)

      await pq.recordPushSuccess(U1, id, T2)

      const row = await rowOf(id)
      expect(row.failureCount).toBe(0)
      expect(row.lastFailureAt).toBeNull()
      expect(row.lastSuccessAt?.getTime()).toBe(T2.getTime())
      expect(row.revokedAt).toBeNull()
    })
  })
})
