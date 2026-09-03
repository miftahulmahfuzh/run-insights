import type { RecordRunRow } from '@/lib/records/recompute'
import type { SessionInput } from '@/lib/metrics/types'

/**
 * **The canonical fixture, in production shape** (F06 plan §1.1).
 *
 * `research/schema.mjs`'s `TRUTH` is screenshot-shaped — camelCase, `distanceKm`, `paceSecPerKm`
 * inside each split, a three-point `postWorkoutHr` series. This is the same run remapped onto F03's
 * Drizzle column names, so it feeds `computeSessionMetrics` with no adapter in between.
 *
 * The remap, field by field (the plan's table, executed):
 *
 *   distanceKm 10.67        -> distanceM 10670        (× 1000, integer — D5)
 *   avgHrBpm/maxHrBpm       -> avgHr / maxHr          (rename)
 *   splits[].paceSecPerKm   -> splits[].paceSec       (rename)
 *   splits[].hrBpm          -> splits[].hr            (rename)
 *   splits[].cadenceSpm     -> splits[].cadence       (rename)
 *   hrZones[]               -> zones[]                (names already match)
 *   postWorkoutHr[0].bpm    -> recovery.endHrBpm      185  (R-9, runs.end_hr_bpm)
 *   postWorkoutHr[1].bpm    -> recovery.hrAt1MinBpm   162  (R-9, runs.hr_1min_post_bpm)
 *   postWorkoutHr[2].bpm    -> dropped                169  — no metric consumes it, no column
 *
 * `tests/metrics.canonicalFixture.test.ts` fails if `TRUTH` and this file ever drift (D13). The
 * point of keeping a 108-field hand-transcribed ground truth is lost the moment the production
 * port silently stops matching it.
 *
 * **Thu 20 Aug 2026, Tangerang, 10.67 km in 1:18:36.** A deliberately unflattering run — 90.6% in
 * zones 4–5, +41 s/km positive split, −18 spm cadence fade — which makes it a far better fixture
 * than a good run would be: every flag in the catalog has something to bite on.
 */
export const CANONICAL_RUN_ID = 'run_canonical'

export const canonicalSession: SessionInput = {
  runId: CANONICAL_RUN_ID,
  occurredOn: '2026-08-20',
  distanceM: 10670,
  durationSec: 4716,
  avgHrBpm: 173,
  splits: [
    { km: 1, timeSec: 396, paceSec: 396, hr: 154, cadence: 154, partial: false },
    { km: 2, timeSec: 428, paceSec: 428, hr: 171, cadence: 148, partial: false },
    { km: 3, timeSec: 431, paceSec: 431, hr: 168, cadence: 151, partial: false },
    { km: 4, timeSec: 431, paceSec: 431, hr: 173, cadence: 148, partial: false },
    { km: 5, timeSec: 423, paceSec: 423, hr: 179, cadence: 146, partial: false },
    { km: 6, timeSec: 440, paceSec: 440, hr: 177, cadence: 145, partial: false },
    { km: 7, timeSec: 452, paceSec: 452, hr: 177, cadence: 143, partial: false },
    { km: 8, timeSec: 474, paceSec: 474, hr: 175, cadence: 139, partial: false },
    { km: 9, timeSec: 467, paceSec: 467, hr: 174, cadence: 138, partial: false },
    { km: 10, timeSec: 480, paceSec: 480, hr: 176, cadence: 136, partial: false },
    // 0.67 km in 288 s. D14's whole reason for existing — see lib/metrics/session.ts.
    { km: 11, timeSec: 288, paceSec: 429, hr: 183, cadence: 145, partial: true },
  ],
  zones: [
    { zone: 1, durationSec: 104, minBpm: null, maxBpm: 140 },
    { zone: 2, durationSec: 25, minBpm: 141, maxBpm: 151 },
    { zone: 3, durationSec: 303, minBpm: 152, maxBpm: 163 },
    { zone: 4, durationSec: 2165, minBpm: 164, maxBpm: 174 },
    { zone: 5, durationSec: 1998, minBpm: 175, maxBpm: null },
  ],
  recovery: { endHrBpm: 185, hrAt1MinBpm: 162 },
}

/**
 * The `runs` columns F09's badge rules read that no metric needs: the wall-clock start, and the
 * place. `TRUTH.startTime` is `'07:07'`; Postgres widens a `time` to `'07:07:00'` and that is the
 * shape `runs.started_at` comes back as, so the fixture stores the widened form — `early_bird` and
 * `late_start` compare it as a string and must be given the string the database would hand them.
 */
export const canonicalRunFacts = {
  startedAt: '07:07:00',
  endedAt: '08:26:00',
  location: 'Tangerang',
} as const

/** The same run with the scalar columns the record catalog reads. `avgPaceSec` is `runs.avg_pace_sec`. */
export const canonicalRecordRun: RecordRunRow = {
  ...canonicalSession,
  avgPaceSec: 442,
  /* From `canonicalRunFacts` rather than re-typed, so the run the badge rules see and the run the
     record catalog sees cannot disagree about when it started — `earliest_start` and `early_bird`
     read the same column. `'07:07:00'` is 25620 seconds past midnight. */
  startedAt: canonicalRunFacts.startedAt,
  activeKcal: 646,
  elevationM: 15,
  avgCadence: 144,
  maxHr: 189,
}
