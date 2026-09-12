import { and, desc, eq } from 'drizzle-orm'

import { newInsightId } from '@/lib/id'

import { db } from '../index'
import { insights, type Insight, type InsightScope } from '../schema'

/* ============================================================================
 * §8 — the LLM insight cache: one row per (user, scope, scope_key, facts_hash).
 * ==========================================================================*/

export interface NewInsightInput {
  scope: InsightScope
  scopeKey: string
  factsHash: string
  payload: unknown
  model: string
}

/**
 * The cache read. `facts_hash` is a sha256 of the metrics fed to the model, so identical facts in
 * the same scope are a hit and no LLM call happens at all.
 */
export async function getInsight(
  userId: string,
  scope: InsightScope,
  scopeKey: string,
  factsHash: string,
): Promise<Insight | null> {
  const rows = await db
    .select()
    .from(insights)
    .where(
      and(
        eq(insights.userId, userId),
        eq(insights.scope, scope),
        eq(insights.scopeKey, scopeKey),
        eq(insights.factsHash, factsHash),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

/**
 * The newest insight for a scope regardless of hash — R-19's insight memory diffs against this,
 * which is what stops week 5 reading identically to week 4. Reads `insights_latest_idx` (R-12).
 */
export async function getLatestInsight(
  userId: string,
  scope: InsightScope,
  scopeKey: string,
): Promise<Insight | null> {
  const rows = await db
    .select()
    .from(insights)
    .where(
      and(eq(insights.userId, userId), eq(insights.scope, scope), eq(insights.scopeKey, scopeKey)),
    )
    .orderBy(desc(insights.createdAt))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Insert-if-new. Two concurrent generations of the same facts (a cron refresh racing a page
 * view) must not produce two rows; the unique index decides and the loser reads the winner's row
 * rather than failing. Deliberately not an upsert: an insight is immutable once written, so
 * overwriting the payload would silently change prose a runner has already read.
 */
export async function saveInsight(
  userId: string,
  input: NewInsightInput,
): Promise<{ id: string; created: boolean }> {
  const id = newInsightId()
  const rows = await db
    .insert(insights)
    .values({ id, userId, ...input })
    .onConflictDoNothing({
      target: [insights.userId, insights.scope, insights.scopeKey, insights.factsHash],
    })
    .returning({ id: insights.id })
  const inserted = rows[0]
  if (inserted) return { id: inserted.id, created: true }
  const existing = await getInsight(userId, input.scope, input.scopeKey, input.factsHash)
  if (!existing) throw new Error('saveInsight: conflict resolved to no row')
  return { id: existing.id, created: false }
}

/**
 * Hygiene, not correctness — and the distinction matters enough to state at the definition.
 *
 * Caching is keyed on `facts_hash`, so a corrected run already misses its cached insight on the
 * next read and regenerates. What this removes is the *stale row itself*, which F08 renders
 * straight from `getLatestInsight` while the fresh one is still being written: without it, a
 * runner who corrects a split sees the old prose sitting under the new numbers for one page load.
 * Deleting is the honest state — no narrative — until the model has read the corrected facts.
 *
 * This is the one deletion in the insights table and it is deliberately narrow: a single
 * `(user, scope, scope_key)` triple, called only from `lib/derived/invalidate.ts`. `extractions`
 * is a different matter entirely and stays append-only (F03 D3).
 */
export async function deleteInsightsForScope(
  userId: string,
  scope: InsightScope,
  scopeKey: string,
): Promise<void> {
  await db
    .delete(insights)
    .where(
      and(eq(insights.userId, userId), eq(insights.scope, scope), eq(insights.scopeKey, scopeKey)),
    )
}
