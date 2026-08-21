import type { HrMax } from './hrMax'
import type { FastestSlowestKm, SessionInput, SessionMetrics, SplitRow, ZonePctRow } from './types'

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *  Every number a run detail page shows, computed in TypeScript. **No LLM touches any of this.**
 *
 *  D2 is not a stylistic preference. `research/control.mjs` handed `glm-5.3` this exact fixture's
 *  splits AND the exact formulas below, and asked it to do the arithmetic: it returned an aerobic
 *  decoupling of **−14.1%** where the truth is **+12.35%**. Not a rounding slip — the sign is
 *  backwards. Shipped, the narrative would have congratulated this runner on aerobic fitness that
 *  "held up" during the exact run where HR pinned at 90%+ of max while pace faded 6'36" → 8'00".
 *
 *  The model's only permitted operation on a number is to copy it into a sentence.
 * ════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Pure.** No database, no clock, no `hrMax` resolution. The resolved `HrMax` arrives as the
 * second argument because resolving it costs a query (F02's `resolveHrMax`), and a pure function
 * that silently does I/O is untestable at the exact moment you most want to test it. F05's commit
 * path and F08's loader each do the one fetch, then call this.
 */
export function computeSessionMetrics(input: SessionInput, hrMax: HrMax | null): SessionMetrics {
  /* ── D14, and the single most important line in this file ────────────────────────────────
   *
   * km 11 of the canonical run is 0.67 km covered in 288 s. Its `paceSec` (429) is a
   * pace-equivalent, but its ROW is not a full kilometre's worth of effort, and every statistic
   * below aggregates rows. Skip this filter and the failures are silent, plausible, and wrong:
   *
   *   cadence fade   −18 spm becomes −9   (`splits.at(-1)` picks up the partial row: half the truth)
   *   split drift    +40.8 s/km becomes +35.2  (floor(length/2) shifts which rows land in half two)
   *   decoupling     +12.35% becomes +11.88%   (half two diluted by an inflated apparent pace)
   *
   * The cadence number is the dangerous one: exactly half, still negative, still "looks right".
   * `tests/metrics.session.test.ts` asserts those three wrong values do NOT come out. */
  const full = input.splits.filter((s) => !s.partial)
  const fullSplitCount = full.length

  /* Two full kms is the floor for anything that splits the run in half: with one row, `half` is 0
   * and `firstHalf` is empty, so every mean is 0/0 = NaN. A NaN that reaches the UI renders as
   * "NaN%"; a null renders as "not enough data for pacing analysis" (§3.3). Defensive rather than
   * live — v0.1.0 ships no manual-entry UI, so every real run arrives with a full splits table. */
  const halvable = fullSplitCount >= 2
  const half = Math.floor(fullSplitCount / 2)
  const firstHalf = full.slice(0, half)
  const secondHalf = full.slice(half)

  const paces = full.map((r) => r.paceSec)

  /* ── Aerobic decoupling (Pa:Hr), first half vs second half ──────────────────────────────
   *
   * AGGREGATE means, not a mean of per-split ratios — the two differ, and the aggregate form is
   * what the sports-science definition and `research/metrics.mjs` both use. Positive means speed
   * per heartbeat fell: the same effort bought less pace as the run went on. */
  const decouplingPct = halvable ? decoupling(firstHalf, secondHalf) : null

  const splitDriftSecPerKm = halvable
    ? mean(secondHalf.map((r) => r.paceSec)) - mean(firstHalf.map((r) => r.paceSec))
    : null

  const paceSdSec = halvable ? populationSd(paces) : null

  /* Last full km minus first full km. `full.at(-1)`, never `input.splits.at(-1)` — see above. */
  const firstFull = full[0] ?? null
  const lastFull = full.at(-1) ?? null
  const cadenceFadeSpm =
    lastFull?.cadence != null && firstFull?.cadence != null
      ? lastFull.cadence - firstFull.cadence
      : null

  const fastestKm = pickKm(full, (a, r) => r.paceSec < a.paceSec)
  const slowestKm = pickKm(full, (a, r) => r.paceSec > a.paceSec)

  /* ── Zones ───────────────────────────────────────────────────────────────────────────────
   * RAW float shares. `roundSharesTo100` exists for the chart's labels and is applied by the
   * CALLER, never here: a rounding artefact must not be able to flip `TOO_MUCH_HARD`. */
  const zoneTotalSec = input.zones.reduce((a, z) => a + z.durationSec, 0)
  const zonePct: ZonePctRow[] = input.zones.map((z) => ({
    zone: z.zone,
    durationSec: z.durationSec,
    pct: zoneTotalSec > 0 ? (z.durationSec / zoneTotalSec) * 100 : 0,
  }))
  const hardPct =
    zoneTotalSec > 0 ? zonePct.filter((z) => z.zone >= 4).reduce((a, z) => a + z.pct, 0) : null

  /* R-9's two columns. `null`, never 0 — a 0 bpm drop is a real and alarming reading; a missing
   * one is not a reading at all, and the two must never render the same. */
  const endHr = input.recovery?.endHrBpm ?? null
  const hr1Min = input.recovery?.hrAt1MinBpm ?? null
  const hrRecovery1MinBpm = endHr != null && hr1Min != null ? endHr - hr1Min : null

  /* The ONE metric that depends on HRmax at all (§3.5). When the resolver returns null — no birth
   * year and no observed max — this is the only session field that disappears, along with the
   * VERY_HIGH_AVG_HR flag it feeds. Everything else above is computable from splits and zones. */
  const avgHrPctMax =
    hrMax != null && input.avgHrBpm != null ? (input.avgHrBpm / hrMax.bpm) * 100 : null

  return {
    runId: input.runId,
    hrMaxUsed: hrMax,
    avgHrPctMax,
    decouplingPct,
    splitDriftSecPerKm,
    paceSdSec,
    cadenceFadeSpm,
    fastestKm,
    slowestKm,
    zonePct,
    hardPct,
    hrRecovery1MinBpm,
    fullSplitCount,
  }
}

/** Speed in m/s per bpm, over aggregate means. The Pa:Hr ratio's one half. */
function halfSpeedPerBpm(rows: readonly SplitRow[]): number | null {
  const hrs = rows.map((r) => r.hr).filter((h): h is number => h != null)
  // Full-km rows are never HR-null on a real extraction; a half missing every reading cannot
  // produce a ratio, and inventing one from the other half would be a fabricated comparison.
  if (rows.length === 0 || hrs.length !== rows.length) return null
  const meanPace = mean(rows.map((r) => r.paceSec))
  if (meanPace <= 0) return null
  const meanHr = mean(hrs)
  if (meanHr <= 0) return null
  return 1000 / meanPace / meanHr
}

function decoupling(
  firstHalf: readonly SplitRow[],
  secondHalf: readonly SplitRow[],
): number | null {
  const r1 = halfSpeedPerBpm(firstHalf)
  const r2 = halfSpeedPerBpm(secondHalf)
  if (r1 == null || r2 == null || r1 === 0) return null
  return ((r1 - r2) / r1) * 100
}

function pickKm(
  rows: readonly SplitRow[],
  better: (best: SplitRow, candidate: SplitRow) => boolean,
): FastestSlowestKm | null {
  const first = rows[0]
  if (!first) return null
  let best = first
  for (const r of rows.slice(1)) if (better(best, r)) best = r
  return { km: best.km, paceSec: best.paceSec }
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** POPULATION sd (÷ n), not sample (÷ n−1): these ten kilometres are the whole run, not a sample
 *  drawn from a larger one. `research/metrics.mjs` uses the same divisor, and 24.72 s is its
 *  output on the canonical fixture. */
function populationSd(values: readonly number[]): number {
  if (values.length === 0) return 0
  const m = mean(values)
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)))
}
