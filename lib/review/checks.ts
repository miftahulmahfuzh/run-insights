import { formatDistanceKm, formatDuration, formatPace } from '@/lib/format'
import type { DraftSplit, DraftZone, FieldPath, ReviewDraft } from './draft'

/**
 * **Confidence, derived from arithmetic rather than from the model.**
 *
 * `schema.mjs`'s `SHAPE` has no confidence field and F04 never asks for one, so self-reported
 * certainty is not available as a ranking signal — and it would be the wrong signal anyway: it
 * comes from the same process that produced the error. What *is* free is that several extracted
 * quantities are supposed to agree with each other by construction. Splits sum to the duration.
 * Zone durations sum to the duration. Distance times pace is the duration. When two numbers that
 * must agree don't, that disagreement points at one of them far more precisely than any
 * self-rating could, because it is derived from the data instead of from the reader.
 *
 * This is what makes the screen affordable. On a clean extraction — which is the expected case;
 * the canonical fixture passes all four — nothing fires, and confirming the run costs **one tap**
 * rather than 108. The cost of review scales with how wrong the extraction is, not with how many
 * fields exist.
 *
 * ── THE HONESTY CONSTRAINT ──────────────────────────────────────────────────────────────────
 * **A check may only implicate fields it can actually name.** `splitsSumVsDuration` knows that
 * something in the splits block disagrees with the duration; it does NOT know which row. So it
 * highlights the block and says "one of the 11 splits", never row 7. Only `partialConsistency`
 * names one exact field, because it is the one check that is row-specific by construction.
 * Overclaiming precision teaches the reviewer to trust a flag that lied about how much it knew —
 * the same sin as trusting the model's absent confidence score.
 *
 * ── TOLERANCES ARE SEEDED, NOT TUNED ────────────────────────────────────────────────────────
 * There is exactly one ground-truth fixture today. Every tolerance below is a starting value
 * chosen to clear the fixture's natural slack and catch the historically-observed error class.
 * `getExtractionErrorProfile` (lib/db/queries.ts) is the intended mechanism for tightening them
 * once a month of real corrections exists.
 *
 * PURE MODULE — no I/O, no React, no `server-only`. Runs on every keystroke in the client and
 * again on the server at commit time to attribute `checkId`s.
 */

export type CheckId =
  | 'splits_sum_vs_duration'
  | 'zones_sum_vs_duration'
  | 'distance_pace_vs_duration'
  | 'partial_consistency'

export interface CheckResult {
  id: CheckId
  ok: boolean
  /** Shown verbatim in the banner. Empty when `ok`. */
  message: string
  /** The dot-paths (lib/review/draft.ts §3) this check can HONESTLY implicate. */
  fieldPaths: FieldPath[]
}

/** What the checks need. A subset of `ReviewDraft`, so a test can build one by hand. */
export interface CheckableDraft {
  durationSec: number | null
  distanceKm: number | null
  avgPaceSecPerKm: number | null
  splits: DraftSplit[]
  hrZones: DraftZone[]
}

const pass = (id: CheckId): CheckResult => ({ id, ok: true, message: '', fieldPaths: [] })

/** `4710` and `4716` → `'6s'`; `2483` and `4716` → `'37:13'`. Seconds read badly past a minute. */
function gap(seconds: number): string {
  const s = Math.round(Math.abs(seconds))
  return s < 60 ? `${s}s` : formatDuration(s)
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/* ============================================================================
 * CHK-1 — the splits should sum to roughly the whole run.
 * Can localize to: the block. Never a row.
 * ==========================================================================*/

export function splitsSumVsDuration(splits: DraftSplit[], durationSec: number | null): CheckResult {
  const id: CheckId = 'splits_sum_vs_duration'
  if (durationSec === null || splits.length === 0) return pass(id)

  const sum = splits.reduce((total, s) => total + s.timeSec, 0)
  const diff = Math.abs(sum - durationSec)
  /**
   * Seeded: 0.5%, minimum 10 s. The fixture's real slack is 6 s over 4,716 s — Apple's own
   * rounding of eleven MM:SS cells — and §1.3's observed misread (split 1 read as 436 s where the
   * screenshot says 6'36" = 396 s) moves the sum by 40 s. The band sits between the two.
   */
  const tolerance = Math.max(10, durationSec * 0.005)

  return {
    id,
    ok: diff <= tolerance,
    message:
      `Splits total ${formatDuration(sum)}, the run is ${formatDuration(durationSec)} ` +
      `(${gap(diff)} off) — one of the ${splits.length} splits below looks off.`,
    fieldPaths: ['splits'],
  }
}

/* ============================================================================
 * CHK-2 — the zone durations should sum to roughly the whole run.
 * Can localize to: the block. Never a row.
 * ==========================================================================*/

export function zonesSumVsDuration(zones: DraftZone[], durationSec: number | null): CheckResult {
  const id: CheckId = 'zones_sum_vs_duration'
  if (durationSec === null || zones.length === 0) return pass(id)

  const sum = zones.reduce((total, z) => total + z.durationSec, 0)
  const diff = Math.abs(sum - durationSec)
  /**
   * Seeded looser than CHK-1 — 3.5%, minimum 90 s — because zones carry real, legitimate slack:
   * time below zone 1's floor, and pause/transition seconds Apple does not classify. The fixture
   * is 121 s short of its own duration and is a *correct* transcription, which is exactly why a
   * 0.5% tolerance here would cry wolf on every clean run and train the reviewer to ignore the
   * banner. A dropped digit in zone 4 (2165 → 2065) still moves it 221 s, well clear.
   */
  const tolerance = Math.max(90, durationSec * 0.035)

  return {
    id,
    ok: diff <= tolerance,
    message:
      `Zone durations total ${formatDuration(sum)}, the run is ${formatDuration(durationSec)} ` +
      `(${gap(diff)} off) — one of the ${zones.length} zones below looks off.`,
    fieldPaths: ['hrZones'],
  }
}

/* ============================================================================
 * CHK-3 — distance x pace should imply the duration.
 * Can localize to: any of the three inputs, never one of them.
 * ==========================================================================*/

export function distancePaceVsDuration(
  distanceKm: number | null,
  avgPaceSecPerKm: number | null,
  durationSec: number | null,
): CheckResult {
  const id: CheckId = 'distance_pace_vs_duration'
  if (distanceKm === null || avgPaceSecPerKm === null || durationSec === null) return pass(id)

  const implied = distanceKm * avgPaceSecPerKm
  const diff = Math.abs(implied - durationSec)
  /**
   * Seeded tightest of the four — 0.5%, minimum 5 s — because this identity is near-exact when
   * all three are read correctly: the fixture lands 0.14 s out. Apple derives the printed pace
   * from the same distance and duration it prints, so any real gap here is a misread digit, not
   * physics. A misread pace and a misread distance are indistinguishable from this side, which is
   * why all three paths are flagged and the copy says "check" rather than "fix".
   */
  const tolerance = Math.max(5, durationSec * 0.005)

  return {
    id,
    ok: diff <= tolerance,
    message:
      `Distance x pace implies ${formatDuration(Math.round(implied))}, but the run is ` +
      `${formatDuration(durationSec)} — check the distance, the pace and the duration above.`,
    fieldPaths: ['distanceKm', 'avgPaceSecPerKm', 'durationSec'],
  }
}

/* ============================================================================
 * CHK-4 — the partial final kilometre (D14).
 * The ONLY check that can name one exact field, because it is inherently about one row.
 * ==========================================================================*/

/** Below this the remainder is rounding, above it the row would have been a full km. */
const PARTIAL_MIN_KM = 0.05
const PARTIAL_MAX_KM = 0.95
/** Seeded. Apple's own MM:SS rounding on a 0.67 km row is worth a few seconds, not fifteen. */
const PARTIAL_PACE_TOLERANCE_SEC = 15

export function partialConsistency(splits: DraftSplit[], distanceKm: number | null): CheckResult {
  const id: CheckId = 'partial_consistency'
  if (distanceKm === null || splits.length === 0) return pass(id)

  const idx = splits.length - 1
  const last = splits[idx]!
  const remainderKm = round2(distanceKm - Math.floor(distanceKm))
  const impliesPartial = remainderKm > PARTIAL_MIN_KM && remainderKm < PARTIAL_MAX_KM

  /**
   * Direction 1, and the one that matters most: the distance says there is a short final
   * kilometre and no row is flagged. Nothing else in the raw extraction would ever surface this.
   * The fixture's km 11 is 288 s — FASTER than every full km in the table (396–480 s) — so an
   * unflagged partial row does not merely skew an average, it inverts the story: a runner whose
   * splits climbed from 6'36" to 8'00" appears to have closed with a sprint.
   */
  if (impliesPartial && !last.partial) {
    return {
      id,
      ok: false,
      message:
        `${formatDistanceKm(distanceKm)} means the last kilometre is only ` +
        `${formatDistanceKm(remainderKm)}, ` +
        `but km ${last.km} is not marked partial. An unmarked partial km is averaged as a full ` +
        `one, which turns a fade into a sprint everywhere downstream.`,
      fieldPaths: [`splits.${idx}.partial`],
    }
  }

  /**
   * Direction 2: the row IS flagged, so its pace has a real denominator to check against. The
   * fixture's 288 s over 0.67 km implies 430 s/km against a stated 429 — one second, which is
   * where the tolerance came from.
   */
  if (last.partial && impliesPartial) {
    const impliedPace = Math.round(last.timeSec / remainderKm)
    if (Math.abs(impliedPace - last.paceSecPerKm) > PARTIAL_PACE_TOLERANCE_SEC) {
      return {
        id,
        ok: false,
        message:
          `Km ${last.km} is marked partial (${formatDistanceKm(remainderKm)}) at ` +
          `${formatPace(last.paceSecPerKm, true)}, but its time works out to ` +
          `${formatPace(impliedPace, true)} — check the time or the pace on that row.`,
        fieldPaths: [`splits.${idx}.paceSecPerKm`, `splits.${idx}.timeSec`],
      }
    }
  }

  /**
   * Direction 3: a row is flagged partial on a distance that has no remainder to spend on it —
   * a 10.00 km run whose km 10 claims to be short. Cheap to catch, and it is the same D14 error
   * with its sign reversed.
   */
  if (last.partial && !impliesPartial) {
    return {
      id,
      ok: false,
      message:
        `Km ${last.km} is marked partial, but ${formatDistanceKm(distanceKm)} leaves no part-kilometre ` +
        `for it to be. Either the distance or the partial mark is wrong.`,
      fieldPaths: [`splits.${idx}.partial`, 'distanceKm'],
    }
  }

  return pass(id)
}

/* ============================================================================
 * The suite, and the attribution helper the commit action uses
 * ==========================================================================*/

export function runAllChecks(draft: CheckableDraft): CheckResult[] {
  return [
    splitsSumVsDuration(draft.splits, draft.durationSec),
    zonesSumVsDuration(draft.hrZones, draft.durationSec),
    distancePaceVsDuration(draft.distanceKm, draft.avgPaceSecPerKm, draft.durationSec),
    partialConsistency(draft.splits, draft.distanceKm),
  ]
}

export function failingChecks(draft: CheckableDraft): CheckResult[] {
  return runAllChecks(draft).filter((c) => !c.ok)
}

/**
 * Which check, if any, was pointing at this field when the reviewer arrived — the `checkId` on
 * every correction event (R-7).
 *
 * Prefix-aware, because a block-level check implicates every leaf inside the block: CHK-1's
 * `'splits'` covers `splits.0.timeSec`. That is the honest reading of "this check could not tell
 * you which row, so it flagged them all", and it is what lets §6.2's query answer the question it
 * exists to answer — *did any automated check catch this, or did the human catch it unaided?*
 *
 * Called against the checks failing on the **baseline** draft, never the corrected one: by the
 * time the reviewer has fixed the number, the check that pointed at it has stopped firing.
 */
export function checkIdForFieldPath(
  failing: readonly CheckResult[],
  path: FieldPath,
): CheckId | undefined {
  for (const check of failing) {
    for (const flagged of check.fieldPaths) {
      if (path === flagged || path.startsWith(`${flagged}.`)) return check.id
    }
  }
  return undefined
}

/**
 * The set of paths currently flagged, for the `check` chip (R-46) on an individual field. A `Set`
 * of the check's own declared paths — expansion to leaves happens in the component, which knows
 * which leaves it is rendering.
 */
export function flaggedPaths(checks: readonly CheckResult[]): Set<FieldPath> {
  const out = new Set<FieldPath>()
  for (const check of checks) {
    if (check.ok) continue
    for (const path of check.fieldPaths) out.add(path)
  }
  return out
}

/** True when `path` — or a block containing it — is flagged. The component-side predicate. */
export function isFlagged(flagged: ReadonlySet<FieldPath>, path: FieldPath): boolean {
  for (const f of flagged) {
    if (path === f || path.startsWith(`${f}.`)) return true
  }
  return false
}

/** `runAllChecks` over a full draft — the review screen's one call site. */
export function checkDraft(draft: ReviewDraft): CheckResult[] {
  return runAllChecks(draft)
}
