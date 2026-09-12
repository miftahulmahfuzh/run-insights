import { and, eq, exists, sql } from 'drizzle-orm'

import { db } from '../index'
import { extractions, runPhotos, runSplits, runZones, runs } from '../schema'

import { NotFoundError } from './errors'

/* ============================================================================
 * §3 Ownership predicates — THE security primitive
 *
 * run_splits, run_zones and run_photos carry no user_id: the composite natural key is the point
 * of those tables, and duplicating the owner into them would be a second source of truth that
 * can drift. Ownership is proved by a correlated EXISTS back to `runs` IN THE SAME STATEMENT, so
 * there is no window between the check and the write.
 * ==========================================================================*/

export function runSplitOwnedBy(userId: string) {
  return exists(
    db
      .select({ ok: sql`1` })
      .from(runs)
      .where(and(eq(runs.id, runSplits.runId), eq(runs.userId, userId))),
  )
}

export function runZoneOwnedBy(userId: string) {
  return exists(
    db
      .select({ ok: sql`1` })
      .from(runs)
      .where(and(eq(runs.id, runZones.runId), eq(runs.userId, userId))),
  )
}

/**
 * A photo may be owned through EITHER parent: before the review commit it only has an
 * extraction, after it also has a run. Both branches are scoped to the same user, so a photo is
 * "mine" if either of my parents claims it — and unreachable otherwise.
 */
export function runPhotoOwnedBy(userId: string) {
  return sql`(${exists(
    db
      .select({ ok: sql`1` })
      .from(extractions)
      .where(and(eq(extractions.id, runPhotos.extractionId), eq(extractions.userId, userId))),
  )} or ${exists(
    db
      .select({ ok: sql`1` })
      .from(runs)
      .where(and(eq(runs.id, runPhotos.runId), eq(runs.userId, userId))),
  )})`
}

/** Proof-before-write, for any mutation that touches a child table. Throws, never returns false. */
export async function assertRunOwned(userId: string, runId: string): Promise<void> {
  const rows = await db
    .select({ ok: sql<number>`1`.mapWith(Number) })
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
    .limit(1)
  if (rows.length === 0) throw new NotFoundError('Run not found')
}

export async function assertExtractionOwned(userId: string, extractionId: string): Promise<void> {
  const rows = await db
    .select({ ok: sql<number>`1`.mapWith(Number) })
    .from(extractions)
    .where(and(eq(extractions.id, extractionId), eq(extractions.userId, userId)))
    .limit(1)
  if (rows.length === 0) throw new NotFoundError('Extraction not found')
}
