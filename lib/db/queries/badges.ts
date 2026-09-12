import { and, asc, eq } from 'drizzle-orm'

import { type DateISO } from '@/lib/date/ranges'

import { db } from '../index'
import { type Badge, badges } from '../schema'

/* ============================================================================
 * §8 — the badge award ledger. An earn is only ever INSERTED; §8 of F13 is
 * explicit that nothing may remove an award row.
 * ==========================================================================*/

/**
 * Every award row for a user, oldest first within each key. `foldAwards` turns them into the
 * per-key shelf entries; nothing reads a raw row and calls it "the badge".
 */
export async function getBadgeAwards(userId: string): Promise<Badge[]> {
  return db
    .select()
    .from(badges)
    .where(eq(badges.userId, userId))
    .orderBy(asc(badges.key), asc(badges.earnedOn))
}

/**
 * The awards one run earned — F11's inline "what did this run get" read.
 *
 * A real `WHERE run_id = $1` rather than the TypeScript filter this used to be. The old comment
 * argued a user has at most 22 badge rows so a second round trip was not worth it; post-F13 the
 * ledger holds one row per earn and grows without bound, so `badges_user_run_idx` is what answers
 * this instead of an array scan over the user's whole history.
 *
 * **A period badge DOES appear here, since F27 round 3, and that is the fix rather than a leak.**
 * This comment used to say the opposite — "`run_id` is null for week, month and lifetime scopes,
 * which is correct — no single run earned `century_club`". A month of running earned the distance;
 * one commit earned the badge, and that commit is a run. So the run that took the month past 100 km
 * now carries `century_club` in its own award list, which is what a runner opening that run expects
 * to see. The rule and its reasoning live in `lib/badges/evaluate.ts`.
 *
 * Rows written before round 3 still carry null and are still unreachable from here, which is why
 * `scripts/backfill-badge-run-ids.mjs` exists.
 */
export async function getBadgeAwardsForRun(userId: string, runId: string): Promise<Badge[]> {
  return db
    .select()
    .from(badges)
    .where(and(eq(badges.userId, userId), eq(badges.runId, runId)))
    .orderBy(asc(badges.key))
}

/**
 * **One award, deduped by the primary key rather than by a read.** Returns false when the row was
 * already there.
 *
 * The opposite shape to `replaceRecords` on purpose, and no longer the same shape as it was before
 * F13. A record is a statement about the current best, so a correction must be able to REMOVE one.
 * A badge is a fact about the past, so an earn is only ever INSERTED — and whether this earn is a
 * new one is `(user_id, key, dedupe_key)`'s question to answer, not the application's. The old
 * `ON CONFLICT DO UPDATE … count + 1` had to guess, and guessed wrong every time a run other than
 * the most recent earner was re-reviewed (F12 §4.1).
 *
 * There is no update branch and no delete anywhere in this layer for `badges`: §8 of F13 is
 * explicit that nothing may remove an award row.
 */
export async function insertBadgeAward(
  userId: string,
  key: string,
  award: {
    runId: string | null
    scopeKey: string | null
    dedupeKey: string
    earnedOn: DateISO
  },
): Promise<boolean> {
  const rows = await db
    .insert(badges)
    .values({ userId, key, ...award, count: 1 })
    .onConflictDoNothing()
    .returning({ key: badges.key })
  return rows.length > 0
}
