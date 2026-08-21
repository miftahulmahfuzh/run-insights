import { computeRecords, toRecordCandidate } from './compute'
import type { RecordKey, RecordRunRow, StoredRecord } from './types'

export type { RecordRunRow } from './types'

/**
 * The one file in `lib/records` that is shaped like I/O — and it still does none itself.
 *
 * Everything reaches the database through the injected `RecordsGateway`, never a direct `db`
 * import, so `catalog.ts`/`compute.ts` stay pure and this orchestrator is testable against a
 * hand-written fake with no live connection in CI. `gateway.ts` holds the real implementation.
 */

export interface RecordsGateway {
  /** Reviewed runs ONLY (D16). An unreviewed run must never set a record. */
  fetchReviewedRuns(userId: string): Promise<RecordRunRow[]>
  readCurrent(userId: string): Promise<Map<RecordKey, StoredRecord>>
  /**
   * R-10 — a full REPLACE (DELETE + INSERT in one batch), never per-key upserts.
   *
   * This is the one place F06 diverges from its own plan's gateway shape (`upsert` +
   * `deleteKeys`), and the reconciliation is why: an upsert cannot express deletion, and a
   * correction that disqualifies the sole run holding `fastest_pace_10k` must REMOVE that row,
   * not leave a stale one pointing at a run that no longer qualifies. Two statements that can
   * half-apply are also two chances to leave the shelf inconsistent; one batch cannot.
   */
  replace(userId: string, rows: readonly StoredRecord[]): Promise<void>
}

export interface RecomputeResult {
  /** The full new record set, exactly as written (or as already stored, if nothing moved). */
  rows: StoredRecord[]
  /** Keys whose holder or value changed on this pass. F09 reads this instead of re-querying. */
  changed: StoredRecord[]
  /** Keys that had a holder and no longer qualify for one at all. */
  removed: RecordKey[]
}

/**
 * ── THE TRIGGER CONTRACT ────────────────────────────────────────────────────────────────────
 *
 * Called from `lib/derived/invalidate.ts`'s `onRunCommitted`, i.e. **synchronously, in the same
 * request as the review commit** — first-time review, post-review correction, or deletion alike.
 * Never a queued job: at ~17 runs a month a full history scan is sub-millisecond-class work, and
 * deferring it would let F09's badge evaluation run against stale records in the very same
 * request that changed them.
 *
 * F06 does not run on a schedule and does not live in `/api/cron/rollup` — that cron refreshes
 * *insights*, not records. Records change only in response to a write to `runs`.
 *
 * The returned `changed` array is the answer to "did a record just move", computed at the exact
 * moment it happened. F09's `new_ceiling` and `long_way_home` consume it rather than diffing the
 * `records` table themselves.
 */
export async function recomputeRecords(
  userId: string,
  gateway: RecordsGateway,
): Promise<RecomputeResult> {
  const runs = await gateway.fetchReviewedRuns(userId)
  const results = computeRecords(runs.map(toRecordCandidate))
  const current = await gateway.readCurrent(userId)

  const rows: StoredRecord[] = []
  const changed: StoredRecord[] = []

  for (const result of results) {
    const held = current.get(result.key)
    const moved = held == null || held.runId !== result.runId || held.value !== result.value

    /* An unchanged key keeps the `previousValue` it already carried. Overwriting it with the
     * current value on every unrelated recompute would erase "you beat 7'30\" to get here" the
     * first time any OTHER record moved — the history is the interesting half of the row. */
    const row: StoredRecord = moved
      ? { ...result, previousValue: held?.value ?? null }
      : { ...result, previousValue: held.previousValue }

    rows.push(row)
    if (moved) changed.push(row)
  }

  const survivors = new Set(results.map((r) => r.key))
  const removed = [...current.keys()].filter((key) => !survivors.has(key))

  /* Skip the write when nothing moved. `records.updated_at` then means "when this record last
   * changed" rather than "when anything was last saved", which is what a UI showing it would
   * assume — and a no-op DELETE+INSERT on every commit is churn for no information. */
  if (changed.length > 0 || removed.length > 0) await gateway.replace(userId, rows)

  return { rows, changed, removed }
}
