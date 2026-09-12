import { asc, eq } from 'drizzle-orm'

import { db } from '../index'
import { records, type NewRecordRow, type RecordRow } from '../schema'

import { type Statement, runBatch } from './internal'

/* ============================================================================
 * §8 — personal records. Recomputed wholesale, never incremented (D7 / R-10).
 * ==========================================================================*/

export async function getRecords(userId: string): Promise<RecordRow[]> {
  return db.select().from(records).where(eq(records.userId, userId)).orderBy(asc(records.key))
}

/**
 * D7 / R-10 — a full replace inside one `db.batch`, never per-key upserts.
 *
 * The asymmetry with badges is the point. A record is a statement about the *current* best, so a
 * correction that demotes the run holding `fastest_pace_10k` must be able to REMOVE that record;
 * an upsert has no way to express deletion and would leave a stale row pointing at a run that no
 * longer qualifies. At 17 runs a month a full recompute is free.
 */
export async function replaceRecords(
  userId: string,
  next: Omit<NewRecordRow, 'userId'>[],
): Promise<void> {
  const statements: Statement[] = [db.delete(records).where(eq(records.userId, userId))]
  if (next.length > 0) {
    statements.push(db.insert(records).values(next.map((r) => ({ ...r, userId }))))
  }
  await runBatch(statements)
}
