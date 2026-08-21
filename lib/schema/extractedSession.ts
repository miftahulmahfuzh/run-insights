import { z } from 'zod'

import { SCREEN_KINDS, type ScreenKind } from '@/lib/extract/constants'

/**
 * The shape one extracted workout arrives in, and the provenance guard that decides which of its
 * fields are even allowed to be populated.
 *
 * WHY EVERY FIELD IS VALIDATED, AT EVERY DEPTH. `IMPLEMENTATION_PLAN.md` §1.6 measured z.ai
 * omitting a field that was listed in a tool schema's `required` array. The vendor does not
 * enforce JSON Schema `required`, and the extraction recipe does not even use function-calling —
 * it asks for raw JSON in the prompt. So there is *less* structural enforcement here than the
 * narrative path had, and nothing may be assumed present because the prompt described it.
 *
 * PURE MODULE. Zod only — no `server-only`, no `@/lib/env`. The review screen (F05) and the
 * poll-result renderer are client components and both need these types.
 */

export { SCREEN_KINDS }
export type { ScreenKind }

export const ScreenKindSchema = z.enum(SCREEN_KINDS)

/**
 * 40–230 bpm. Wide enough for a resting trace and a maximal effort, narrow enough that a misread
 * axis label (`1890`) or a transposed digit (`19`) is refused rather than reviewed.
 */
const bpm = z.number().int().min(40).max(230).nullable()
const nonNegInt = z.number().int().nonnegative().nullable()

/**
 * One row of the splits table.
 *
 * Every field is REQUIRED (nullable where Apple can legitimately leave the cell empty) and none
 * carries a `.default()`. That is the point: a row missing `hrBpm` is exactly the vendor failure
 * §1.6 measured, and it must fail Zod so the repair round-trip fires — not be silently defaulted
 * into a run a human then confirms without ever seeing what was lost.
 */
export const ExtractedSplit = z.object({
  km: z.number().int().positive(),
  timeSec: z.number().int().positive(),
  paceSecPerKm: z.number().int().positive(),
  hrBpm: bpm,
  cadenceSpm: z.number().int().min(0).max(300).nullable(),
  /** D14 — the final sub-kilometre row. Never averaged into a pace. */
  partial: z.boolean(),
})
export type ExtractedSplit = z.infer<typeof ExtractedSplit>

export const ExtractedZone = z.object({
  zone: z.number().int().min(1).max(5),
  durationSec: z.number().int().nonnegative(),
  /** null is legitimate for zone 1 only — it has no lower bound. */
  minBpm: z.number().int().nullable(),
  /** null is legitimate for zone 5 only — it has no upper bound. */
  maxBpm: z.number().int().nullable(),
})
export type ExtractedZone = z.infer<typeof ExtractedZone>

/** R-9: `[0]` is `runs.end_hr_bpm`, `[1]` is `runs.hr_1min_post_bpm`. F05 maps them. */
export const ExtractedPostWorkoutHr = z.object({
  label: z.string().min(1),
  bpm: z.number().int().min(40).max(230),
})
export type ExtractedPostWorkoutHr = z.infer<typeof ExtractedPostWorkoutHr>

/**
 * The scalar half is nullable-with-a-default throughout, because "this field was not visible"
 * is a legitimate answer for every one of them and the prompt says so (RULE 1). The array and
 * object halves above are strict, because a row that exists must be complete.
 */
export const RawExtractedSession = z.object({
  activityType: z.string().nullable().default(null),
  goal: z.string().nullable().default(null),
  dateLabel: z.string().nullable().default(null),
  startTime: z.string().nullable().default(null),
  endTime: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  durationSec: z.number().int().positive().nullable().default(null),
  distanceKm: z.number().positive().nullable().default(null),
  activeKcal: nonNegInt.default(null),
  totalKcal: nonNegInt.default(null),
  elevationGainM: nonNegInt.default(null),
  avgCadenceSpm: z.number().int().min(0).max(300).nullable().default(null),
  avgPaceSecPerKm: z.number().int().positive().nullable().default(null),
  avgHrBpm: bpm.default(null),
  maxHrBpm: bpm.default(null),
  restingHrBpm: z.number().int().min(30).max(120).nullable().default(null),
  splits: z.array(ExtractedSplit).default([]),
  hrZones: z.array(ExtractedZone).default([]),
  postWorkoutHr: z.array(ExtractedPostWorkoutHr).default([]),
})

export type ExtractedSession = z.infer<typeof RawExtractedSession>
export type ExtractedSessionField = keyof ExtractedSession

/**
 * Which screens can show which field — **settled by R-4, which read the three source
 * screenshots.** This replaces the "ASSUMPTION, VERIFY IN TASK 6" table the plan shipped with;
 * the verification happened in the reconciliation, so the task is closed and this table is
 * evidence, not inference.
 *
 * It is a list of screens per field, not one owner per field, because R-4 found exactly one
 * field on two screens: `avgHrBpm` is on the summary *and* the heart-rate screen. A single-owner
 * table would wrongly null it out for someone who uploaded only the heart-rate screenshot.
 *
 * `splits` is deliberately `['splits']` alone even though R-4 records the summary screen showing
 * the **first three rows**. Those three rows are real, but a three-row array for an eleven-km
 * run is a silently truncated table, and completeness is load-bearing for every pace average
 * (D14), for `metronome` and `fast_start_fool`, and for the split-sum cross-check F05 runs. A
 * truncated splits table is the exact failure `tests/research/score.test.ts` guards against; it
 * must not be reachable through a legitimate upload. RULE 6a in the prompt tells the model the
 * same thing.
 */
export const FIELD_SOURCES: Record<ExtractedSessionField, readonly ScreenKind[]> = {
  activityType: ['summary'],
  goal: ['summary'],
  dateLabel: ['summary'],
  startTime: ['summary'],
  endTime: ['summary'],
  location: ['summary'],
  durationSec: ['summary'],
  distanceKm: ['summary'],
  activeKcal: ['summary'],
  totalKcal: ['summary'],
  elevationGainM: ['summary'],
  avgCadenceSpm: ['summary'],
  avgPaceSecPerKm: ['summary'],
  // R-4: present on BOTH, agreed at 173 in the fixture. Summary is preferred (see below).
  avgHrBpm: ['summary', 'heartrate'],
  // R-4: the chart's top-of-axis label. Incidental chrome on one screen, never a labelled field.
  maxHrBpm: ['heartrate'],
  // R-4: the zones footnote's small print.
  restingHrBpm: ['heartrate'],
  splits: ['splits'],
  hrZones: ['heartrate'],
  postWorkoutHr: ['heartrate'],
}

/**
 * The empty value for a field, used when no uploaded screen could have produced it.
 *
 * A FUNCTION, not a constant object, and the three array fields are re-created on every read.
 * A module-level `{ splits: [] }` would hand the SAME array to every extraction and to every
 * blank review form in the process — one caller pushing a split row would silently seed
 * everyone else's. That is a genuinely nasty class of bug in a long-lived serverless instance,
 * and it was caught by the "returns a fresh object each call" test rather than in production.
 */
function emptyFieldValues(): { [K in ExtractedSessionField]: ExtractedSession[K] } {
  return {
    activityType: null,
    goal: null,
    dateLabel: null,
    startTime: null,
    endTime: null,
    location: null,
    durationSec: null,
    distanceKm: null,
    activeKcal: null,
    totalKcal: null,
    elevationGainM: null,
    avgCadenceSpm: null,
    avgPaceSecPerKm: null,
    avgHrBpm: null,
    maxHrBpm: null,
    restingHrBpm: null,
    splits: [],
    hrZones: [],
    postWorkoutHr: [],
  }
}

export const ALL_SESSION_FIELDS = Object.keys(FIELD_SOURCES) as ExtractedSessionField[]

/**
 * R-45's provenance resolver, and the whole of it: a field's source photo is the photo whose
 * `kind` matches the field's section. Derived, never stored, no new model output, no bounding
 * boxes — R-45 rejected those because nothing measured what the coordinates cost and a wrong box
 * is worse than no box.
 *
 * For the one two-screen field, this returns `'summary'`, per R-4's merge rule: **prefer the
 * summary screen.** They agreed at 173 in the fixture, and if they ever disagree that is a
 * genuine extraction fault the reviewer should see rather than a tie the code quietly breaks.
 */
export function sectionForField(field: ExtractedSessionField): ScreenKind {
  return FIELD_SOURCES[field][0]!
}

/** True when at least one uploaded screen could legitimately have shown this field. */
export function fieldIsReachable(
  field: ExtractedSessionField,
  kindsPresent: ReadonlySet<ScreenKind>,
): boolean {
  return FIELD_SOURCES[field].some((kind) => kindsPresent.has(kind))
}

/**
 * The schema for THIS extraction, parameterised by which screens were actually uploaded.
 *
 * `kindsPresent` comes from **our own upload records**, never from the model's response, so the
 * guard cannot be defeated by a model claiming to have seen a screen it was not given.
 *
 * The null-out is HARD, not a warning. If the heart-rate screen was never uploaded and the model
 * returns five populated `hrZones` rows anyway, those rows are discarded before a human ever
 * sees them. There is no legitimate way for those numbers to be real — a zones table cannot be
 * transcribed from a photo that is not of a zones table — so there is no legitimate reason to
 * show them to a reviewer as "extracted".
 */
export function makeExtractedSessionSchema(kindsPresent: ReadonlySet<ScreenKind>) {
  return RawExtractedSession.transform((value): ExtractedSession => {
    const out = { ...value }
    const empty = emptyFieldValues()
    for (const field of ALL_SESSION_FIELDS) {
      if (!fieldIsReachable(field, kindsPresent)) {
        // Index-signature-safe assignment: the two maps are keyed identically by construction.
        ;(out as Record<string, unknown>)[field] = empty[field]
      }
    }
    return out
  })
}

/** An all-empty session — what F05's review screen renders for a `failed` extraction (§8.1). */
export function emptyExtractedSession(): ExtractedSession {
  return emptyFieldValues()
}

/**
 * Compact, model-readable summary of what Zod rejected, for the R-2 text-only repair note.
 * Capped at twelve issues: a longer list is a model that ignored the shape entirely, and no
 * repair prompt fixes that.
 */
export function describeZodIssues(error: unknown): string {
  const issues = (error as { issues?: Array<{ path: unknown[]; message: string }> })?.issues
  if (!Array.isArray(issues)) return String(error)
  return issues
    .slice(0, 12)
    .map((issue) => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
}
