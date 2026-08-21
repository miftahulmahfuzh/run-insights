import type { SessionMetrics, SplitRow } from './types'

/**
 * Fixed, hand-authored observations about one run. **The narrative layer never invents a code.**
 *
 * F07's plan states the same rule from the consuming side: the flag catalog stays entirely F06's,
 * and `glm-5.3` is handed the codes that fired plus their values, and writes prose about them. A
 * model free to coin `OVERTRAINING_RISK` on a bad day is a model making a medical-adjacent claim
 * nobody wrote, tested, or can reproduce.
 *
 * Every threshold below is **strict**. A run sitting exactly on 70.0% hard time did not exceed
 * 70%, and `tests/metrics.flags.test.ts` pins that for all seven codes: one case at the line that
 * does not fire, one just past it that does.
 */

export type FlagCode =
  | 'HIGH_DECOUPLING'
  | 'TOO_MUCH_HARD'
  | 'POSITIVE_SPLIT'
  | 'CADENCE_FADE'
  | 'VERY_HIGH_AVG_HR'
  | 'SLOW_HR_RECOVERY'
  | 'FAST_START'

export type FlagSeverity = 'info' | 'warn'

export interface Flag {
  code: FlagCode
  severity: FlagSeverity
  /** The metric value that tripped it, raw and unrounded — the UI and F07 both quote this. */
  value: number
}

/**
 * The thresholds, as data, so a reader can check them against the plan's table without reading
 * control flow. Exported because F08's copy ("above 70% is a lot") should name the same numbers
 * this function compares against, rather than repeating them in a string.
 */
export const FLAG_THRESHOLDS = {
  /** Pa:Hr drift above this % means the aerobic system was giving way. */
  HIGH_DECOUPLING: 5,
  /** Share of the run in zones 4–5. */
  TOO_MUCH_HARD: 70,
  /** Second half slower than the first by more than this many s/km. */
  POSITIVE_SPLIT: 30,
  /** Cadence fade this negative or worse (spm). */
  CADENCE_FADE: -8,
  /** Average HR above this % of max. */
  VERY_HIGH_AVG_HR: 90,
  /** A one-minute drop below this many bpm. */
  SLOW_HR_RECOVERY: 20,
  /** First full km within this many s/km of the run's fastest — i.e. it WAS the fast one. */
  FAST_START_TOLERANCE_SEC: 1,
} as const

/**
 * `m` is already-computed metrics; `firstFullSplit` is the one raw row `FAST_START` needs. Taking
 * both keeps this function independent of `computeSessionMetrics` — a fires/does-not-fire test
 * hand-builds a `SessionMetrics` and toggles one field, with no fixture in sight.
 *
 * **`firstFullSplit`, never `splits[0]`.** The reference implementation indexes the raw array and
 * is correct on this fixture only because km 1 happens not to be partial. Under D14 a partial
 * first row is not a shape the extractor produces, but comparing the wrong row costs nothing to
 * prevent and everything to debug.
 *
 * A null metric never fires its flag. Absence is not "false": when HRmax cannot be resolved,
 * `VERY_HIGH_AVG_HR` is simply not in the array, which the UI renders as nothing at all rather
 * than as a reassuring "heart rate was fine".
 */
export function evaluateSessionFlags(m: SessionMetrics, firstFullSplit: SplitRow | null): Flag[] {
  const out: Flag[] = []
  const t = FLAG_THRESHOLDS

  if (m.decouplingPct != null && m.decouplingPct > t.HIGH_DECOUPLING) {
    out.push({ code: 'HIGH_DECOUPLING', severity: 'warn', value: m.decouplingPct })
  }
  if (m.hardPct != null && m.hardPct > t.TOO_MUCH_HARD) {
    out.push({ code: 'TOO_MUCH_HARD', severity: 'warn', value: m.hardPct })
  }
  if (m.splitDriftSecPerKm != null && m.splitDriftSecPerKm > t.POSITIVE_SPLIT) {
    out.push({ code: 'POSITIVE_SPLIT', severity: 'info', value: m.splitDriftSecPerKm })
  }
  if (m.cadenceFadeSpm != null && m.cadenceFadeSpm < t.CADENCE_FADE) {
    out.push({ code: 'CADENCE_FADE', severity: 'warn', value: m.cadenceFadeSpm })
  }
  if (m.avgHrPctMax != null && m.avgHrPctMax > t.VERY_HIGH_AVG_HR) {
    out.push({ code: 'VERY_HIGH_AVG_HR', severity: 'warn', value: m.avgHrPctMax })
  }
  if (m.hrRecovery1MinBpm != null && m.hrRecovery1MinBpm < t.SLOW_HR_RECOVERY) {
    out.push({ code: 'SLOW_HR_RECOVERY', severity: 'info', value: m.hrRecovery1MinBpm })
  }
  if (
    firstFullSplit != null &&
    m.fastestKm != null &&
    firstFullSplit.paceSec <= m.fastestKm.paceSec + t.FAST_START_TOLERANCE_SEC
  ) {
    out.push({ code: 'FAST_START', severity: 'info', value: firstFullSplit.paceSec })
  }

  return out
}
