import type { DateISO } from '@/lib/date/ranges'
import { computeSessionMetrics } from '@/lib/metrics/session'
import { RECORD_CATALOG } from './catalog'
import type { RecordCandidate, RecordDefinition, RecordResult, RecordRunRow } from './types'

/**
 * The pure reduction: candidates in, one winner per key out.
 *
 * **Records are recomputed, never incremented** (roadmap §4.5). A correction in review can lower a
 * distance below a qualifier or delete a run outright, and the only implementation that survives
 * that is a full re-derive. At ~17 runs a month this is free.
 *
 * **Absence is meaningful.** A key nothing qualifies for is simply missing from the result — never
 * a synthetic zero row. "You have no 10 km+ run yet" and "your best 10 km pace is 0" are very
 * different sentences and only one of them is true.
 */
export function computeRecords(candidates: readonly RecordCandidate[]): RecordResult[] {
  const out: RecordResult[] = []
  for (const def of RECORD_CATALOG) {
    const winner = bestFor(def, candidates)
    if (winner) out.push(winner)
  }
  return out
}

function bestFor(
  def: RecordDefinition,
  candidates: readonly RecordCandidate[],
): RecordResult | null {
  let best: RecordResult | null = null

  for (const c of candidates) {
    if (!def.qualifies(c)) continue
    const value = def.valueOf(c)
    if (value == null) continue

    if (best === null || beats(def.direction, value, best, c)) {
      best = { key: def.key, runId: c.runId, value, achievedOn: c.occurredOn }
    }
  }
  return best
}

/**
 * **A challenger must beat the holder STRICTLY.** On an exact tie the record stays with whoever
 * got there first — earliest `occurredOn`, then `runId` for full determinism when two runs share
 * a day. Equalling a record is not breaking it, and a tie-break that depended on iteration order
 * would silently reassign records between two recomputes over the same data.
 */
function beats(
  direction: 'max' | 'min',
  value: number,
  holder: RecordResult,
  candidate: RecordCandidate,
): boolean {
  if (value !== holder.value)
    return direction === 'max' ? value > holder.value : value < holder.value
  if (candidate.occurredOn !== holder.achievedOn) return candidate.occurredOn < holder.achievedOn
  return candidate.runId < holder.runId
}

/**
 * Reuses `computeSessionMetrics` for the two derived fields rather than re-implementing the
 * fastest-km scan and the decoupling formula. `hrMax` is `null` on purpose: **no record key
 * divides by HRmax** (§3.5 — `highest_max_hr` uses the raw reading and `best_paced_run` uses
 * decoupling), so resolving one per run during a whole-history scan would buy a query per run and
 * change nothing about the answer.
 */
export function toRecordCandidate(run: RecordRunRow): RecordCandidate {
  const metrics = computeSessionMetrics(run, null)
  return {
    runId: run.runId,
    occurredOn: run.occurredOn as DateISO,
    distanceM: run.distanceM,
    durationSec: run.durationSec,
    avgPaceSec: run.avgPaceSec,
    activeKcal: run.activeKcal,
    elevationM: run.elevationM,
    avgCadence: run.avgCadence,
    maxHr: run.maxHr,
    fastestFullKmPaceSec: metrics.fastestKm?.paceSec ?? null,
    // Basis points, ABSOLUTE: a run that got faster per heartbeat is as well-paced as one that
    // held level, and both beat one that drifted. 12.3466% -> 1235 bp, and `records.value` stays
    // an integer for every key (D5).
    decouplingBp:
      metrics.decouplingPct == null ? null : Math.round(Math.abs(metrics.decouplingPct) * 100),
  }
}
