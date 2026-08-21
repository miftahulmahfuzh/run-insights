import 'server-only'

import type { CorrectionEvent } from '@/lib/db/schema'

/**
 * **The invalidation contract.** Shipped by F05 as a real, exported, currently-no-op function —
 * not as a TODO comment, and not as a hook each downstream feature bolts on when it lands.
 *
 * WHY IT EXISTS BEFORE ANYTHING IT INVALIDATES. F05 is the only place a run's numbers can ever
 * change: the first commit and every later correction both go through `commitReviewAction`. The
 * build order (F05 → F06 → F07 → F09) means metrics, insights and badges are all written *after*
 * that write path is finished, so unless the seam is cut now, each of them has to reverse-engineer
 * where a correction originates and add its own call — three chances to miss the post-review edit
 * path, which is the rarer and therefore less-tested one.
 *
 * So the caller is written once, today, and each feature fills in its own section of the body.
 * Nothing about the commit action changes when F06 lands.
 *
 * ── FAILURE POLICY (plan §7.3) ──────────────────────────────────────────────────────────────
 * This runs AFTER the run transaction has committed, and its failure must never roll that back.
 * A human confirmed those numbers; losing their save because a cache could not be swept is the
 * wrong trade in every direction. The caller catches, logs, and carries on.
 */

export interface RunChangeEvent {
  runId: string
  userId: string
  /** The field paths that got a new corrections entry on this commit (R-7 keys). */
  changedFieldPaths: string[]
  /** `runs.occurred_on` as it stands after the write. */
  occurredOn: string
  /** Set only when `occurred_on` itself moved — the week and month it left must be swept too. */
  previousOccurredOn: string | null
  phase: CorrectionEvent['phase']
}

/**
 * Called once per successful commit, inside `commitReviewAction`, immediately after the run
 * transaction returns.
 *
 * ── F06 (lib/metrics, lib/records) — NOT YET BUILT ──────────────────────────────────────────
 * Recompute every `lib/metrics/*` value for `runId`; they are pure functions over one run's own
 * rows, so this is cheap. Then **recompute `records` for `userId` wholesale** — never increment,
 * never patch one key. R-10 gives the mechanism (`replaceRecords`, a DELETE + INSERT in one
 * batch) and the reason: a per-key upsert cannot express *deletion*, and a correction that
 * disqualifies the only run holding `fastest_pace_10k` has to remove that record, not leave a
 * stale one pointing at a run that no longer qualifies. At ~17 runs a month a full recompute is
 * free.
 *
 * ── F07 (insights) — NOT YET BUILT ──────────────────────────────────────────────────────────
 * Delete `insights` rows for `(userId, 'session', runId)`, for `(userId, 'week',
 * isoWeekKeyOf(occurredOn))` and `(userId, 'month', monthKey(occurredOn))` — plus the same two
 * for `previousOccurredOn` when the date itself moved.
 *
 * This deletion is hygiene, not correctness: caching is keyed on `facts_hash`, so a changed
 * metric already misses the cache on the next read. The correctness requirement is the other half
 * of the same rule, and it binds F07 and F08 rather than this function: **an insight is fetched
 * by the full tuple `(user_id, scope, scope_key, facts_hash)` — never by `(user_id, scope,
 * scope_key)` ordered by recency.** The latter renders a stale narrative next to corrected
 * numbers, silently, which is the exact failure D2 exists to prevent one layer down.
 *
 * ── F09 (badges) — NOT YET BUILT ────────────────────────────────────────────────────────────
 * Delete session-scoped badge rows where `run_id = runId`, re-run every session-scoped rule
 * against the corrected run, re-insert what still fires. For week- and month-scoped rules whose
 * `scope_key` covers this run's new *or former* period, recompute that scope_key fresh — same
 * "recompute, never increment" discipline as records, for the same reason: a correction can make
 * an earned badge stop being earned. Move a run across a week boundary and `self_reward`'s "4
 * runs in one ISO week" no longer holds for the week it left.
 *
 * Note the one asymmetry with records: `badges.run_id` is `ON DELETE SET NULL` (R-22), so badge
 * history survives a deleted run. Recomputation here must not resurrect a badge for a run that is
 * gone, nor delete the historical row for one that fired legitimately.
 */
export async function onRunCommitted(event: RunChangeEvent): Promise<void> {
  // F06 / F07 / F09 fill this in. Deliberately not a `throw new Error('not implemented')`: the
  // commit path is live today and a throw here would make every save log an error it cannot act
  // on. The reference to `event` keeps the parameter honest under noUnusedParameters.
  void event
}
