'use server'

import { revalidatePath } from 'next/cache'

import { requireUserId } from '@/lib/auth/requireUserId'
import {
  isValidIsoWeekKey,
  isValidMonthKey,
  type IsoWeekKey,
  type MonthKey,
} from '@/lib/date/ranges'
import { isValidId } from '@/lib/id'
import { getOrCreateInsight } from '@/lib/llm/narrate'
import { loadMonthFacts, loadSessionFacts, loadWeekFacts } from './load'

/**
 * **The non-blocking boundary (§7.2).** These are the only sanctioned callers of
 * `getOrCreateInsight` outside `/api/cron/rollup`.
 *
 * ── WHY A SERVER ACTION AND NOT A ROUTE HANDLER ───────────────────────────────────────────────
 * D7 fixes the route-handler list at `/api/extract`, `/api/upload`, `/api/auth/[...nextauth]` and
 * `/api/cron/*`, and says Server Actions carry every other mutation. Generating an insight writes
 * a row, so it is a mutation, so it is an action. F07's plan named "a route handler *or* a Server
 * Action" and D7 picks between them.
 *
 * ── WHY THE PAGE DOES NOT AWAIT THIS ──────────────────────────────────────────────────────────
 * A cache miss costs 10–35 s against a model. The page server-renders its metrics, charts and
 * splits immediately from stored, deterministic data (F06 shipped before F07 precisely so that
 * screen is complete without prose), and `components/insights/InsightTrigger.tsx` calls the
 * action from a client effect afterwards. On a hit — the common case, and the only case after the
 * nightly cron for week and month — the action returns in single-digit milliseconds having made
 * no model call at all.
 *
 * ── THE RETURN VALUE IS NOT THE PROSE ─────────────────────────────────────────────────────────
 * `{ changed }` says only whether a new row was written. The caller responds by asking Next to
 * re-render the server component, which reads the row the normal way. Passing the payload back
 * through the action would give the app two paths that render an insight and one of them would
 * eventually diverge.
 */

export interface EnsureInsightResult {
  /** True when a new insight row was written and the page should re-render to pick it up. */
  changed: boolean
  /** True when the model was unreachable or answered twice with something invalid (§7.3). */
  unavailable: boolean
}

const NOTHING: EnsureInsightResult = { changed: false, unavailable: false }

export async function ensureRunInsight(runId: string): Promise<EnsureInsightResult> {
  const userId = await requireUserId()
  if (!isValidId(runId)) return NOTHING

  const facts = await loadSessionFacts(userId, runId)
  // Unknown, not this user's, or not yet reviewed (D16). All three are "there is nothing to say
  // about this run", and telling the caller which would be an ownership oracle.
  if (facts == null) return NOTHING

  const result = await getOrCreateInsight(userId, 'session', runId, facts)
  if (result.cached) return NOTHING
  if (result.payload == null) return { changed: false, unavailable: true }

  revalidatePath(`/r/${runId}`)
  return { changed: true, unavailable: false }
}

export async function ensureWeekInsight(weekKey: string): Promise<EnsureInsightResult> {
  const userId = await requireUserId()
  if (!isValidIsoWeekKey(weekKey)) return NOTHING
  return ensurePeriod(userId, 'week', weekKey)
}

export async function ensureMonthInsight(monthKey: string): Promise<EnsureInsightResult> {
  const userId = await requireUserId()
  if (!isValidMonthKey(monthKey)) return NOTHING
  return ensurePeriod(userId, 'month', monthKey)
}

async function ensurePeriod(
  userId: string,
  scope: 'week' | 'month',
  key: IsoWeekKey | MonthKey,
): Promise<EnsureInsightResult> {
  const facts =
    scope === 'week' ? await loadWeekFacts(userId, key) : await loadMonthFacts(userId, key)

  const result = await getOrCreateInsight(userId, scope, key, facts)
  if (result.cached) return NOTHING
  if (result.payload == null) return { changed: false, unavailable: true }

  // One path, both scopes: `/trends` is a single route keyed by `?scope=&key=`, so there is one
  // path to revalidate however the reader got there.
  revalidatePath('/trends')
  return { changed: true, unavailable: false }
}
