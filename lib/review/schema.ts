import { z } from 'zod'

import { isValidDateISO } from '@/lib/date/ranges'
import type { NewRunInput } from '@/lib/db/queries'
import type { RunIntent, RunSource } from '@/lib/db/schema'
import { RUN_INTENTS, widenTime } from './draft'

/**
 * **The wall.** Everything past this schema is treated as ground truth by every other feature in
 * the product — D16's reviewed-data invariant means the rollups, the records, the badges and the
 * narrative all read `runs` without ever asking again whether it is plausible. So this is the
 * last place a nonsense value can be stopped, and it validates the payload the *browser* sent,
 * not the payload the extractor produced: a client is not trusted just because it was ours.
 *
 * ── WHAT IS DELIBERATELY *NOT* VALIDATED ────────────────────────────────────────────────────
 * The four consistency checks (lib/review/checks.ts) do not run here and cannot block a commit.
 * They are advice, not gates: a genuinely odd run — a paused watch, a tunnel, a treadmill
 * segment — can legitimately fail CHK-2 forever, and a human who has looked at the screenshot
 * and decided the numbers are right outranks arithmetic that only knows they disagree. D1 says a
 * human confirms every run; it does not say a human may only confirm tidy ones.
 *
 * ── AND WHY THE SAVE BUTTON IS NEVER PRE-EMPTIVELY DISABLED ─────────────────────────────────
 * The failures below are all "this cannot be stored", never "this looks unusual". A disabled
 * button with no explanation is the worst version of that message, so the button always submits
 * and the errors come back attached to the fields that caused them.
 */

/* ============================================================================
 * §1 Primitives
 * ==========================================================================*/

const dateISO = z.string().refine(isValidDateISO, 'Use a real date')

/** 'HH:MM' or 'HH:MM:SS'. Blank arrives as null from the client, never as ''. */
const clockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, 'Use a 24-hour time like 07:07')
  .nullable()

const optionalText = z.string().trim().min(1).max(200).nullable()
const nonNegInt = z.number().int().min(0).max(100_000).nullable()
const bpm = z.number().int().min(40).max(230).nullable()

/**
 * 24 hours. Not a taste call about how long a run should be: `duration_sec` is the denominator of
 * every pace, every zone percentage and every decoupling figure in F06, so a transposed digit
 * that survives here poisons all of them at once.
 */
const MAX_DURATION_SEC = 86_400
/** 300 km. Wide enough for an ultra, narrow enough to catch metres typed into a km field. */
const MAX_DISTANCE_KM = 300

export const DraftSplitSchema = z.object({
  km: z.number().int().positive().max(500),
  timeSec: z.number().int().positive().max(MAX_DURATION_SEC),
  paceSecPerKm: z.number().int().positive().max(MAX_DURATION_SEC),
  hrBpm: bpm,
  cadenceSpm: z.number().int().min(0).max(300).nullable(),
  partial: z.boolean(),
})

export const DraftZoneSchema = z.object({
  zone: z.number().int().min(1).max(5),
  durationSec: z.number().int().min(0).max(MAX_DURATION_SEC),
  minBpm: z.number().int().min(30).max(230).nullable(),
  maxBpm: z.number().int().min(30).max(230).nullable(),
})

/** Positional (R-9), so a cleared slot is `null` and not a removed element. */
export const DraftPostWorkoutHrSchema = z.object({
  label: z.string().trim().min(1).max(20),
  bpm: bpm,
})

/* ============================================================================
 * §2 The draft
 * ==========================================================================*/

export const ReviewDraftSchema = z
  .object({
    occurredOn: dateISO,
    activityType: optionalText,
    goal: optionalText,
    dateLabel: optionalText,
    startTime: clockTime,
    endTime: clockTime,
    location: optionalText,
    durationSec: z.number().int().positive().max(MAX_DURATION_SEC),
    distanceKm: z.number().positive().max(MAX_DISTANCE_KM),
    activeKcal: nonNegInt,
    totalKcal: nonNegInt,
    elevationGainM: nonNegInt,
    avgCadenceSpm: z.number().int().min(0).max(300).nullable(),
    avgPaceSecPerKm: z.number().int().positive().max(MAX_DURATION_SEC).nullable(),
    avgHrBpm: bpm,
    maxHrBpm: bpm,
    restingHrBpm: z.number().int().min(30).max(120).nullable(),
    /**
     * **Zero splits is legal.** `/upload` accepts one screenshot, and a summary-only upload has
     * no splits table to read — the provenance guard nulls the array out precisely so no invented
     * rows reach a reviewer. Requiring at least one row would make that entirely normal upload
     * uncommittable, which is a worse failure than a run with no split detail. (Plan §10 item 3
     * said "1-20 splits"; it was written against the three-screenshot fixture.)
     */
    splits: z.array(DraftSplitSchema).max(60),
    /**
     * Zero zones or all five, never a partial set — for the same reason. Apple always prints all
     * five rows when it prints any, so three zones means three were transcribed and two were
     * lost, and a zone percentage computed over a truncated denominator is wrong in a way nothing
     * downstream can detect.
     */
    hrZones: z.array(DraftZoneSchema).max(5),
    postWorkoutHr: z.array(DraftPostWorkoutHrSchema).max(5),
    intent: z.enum(RUN_INTENTS as unknown as [RunIntent, ...RunIntent[]]).nullable(),
    note: z.string().trim().max(500).nullable(),
  })
  .superRefine((draft, ctx) => {
    /* D14 — at most one partial row, and it must be the last one. A partial km in the middle of a
     * table is not a short final kilometre, it is a misread row, and F06's `WHERE partial = false`
     * filter would silently drop a full kilometre out of every pace average. */
    const partialIndexes = draft.splits.flatMap((s, i) => (s.partial ? [i] : []))
    if (partialIndexes.length > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['splits', partialIndexes[1]!, 'partial'],
        message: 'Only the final kilometre can be partial.',
      })
    } else if (partialIndexes.length === 1 && partialIndexes[0] !== draft.splits.length - 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['splits', partialIndexes[0]!, 'partial'],
        message: 'Only the final kilometre can be partial.',
      })
    }

    /* (run_id, km) is the primary key of run_splits. Two rows claiming km 7 is not a validation
     * nicety — the INSERT would fail with a constraint error the reviewer cannot act on. */
    const seenKm = new Set<number>()
    draft.splits.forEach((split, i) => {
      if (seenKm.has(split.km)) {
        ctx.addIssue({
          code: 'custom',
          path: ['splits', i, 'km'],
          message: `There is already a km ${split.km}.`,
        })
      }
      seenKm.add(split.km)
    })

    if (draft.hrZones.length !== 0 && draft.hrZones.length !== 5) {
      ctx.addIssue({
        code: 'custom',
        path: ['hrZones'],
        message: 'Heart-rate zones come as all five rows or none at all.',
      })
    }
    const seenZone = new Set<number>()
    draft.hrZones.forEach((zone, i) => {
      if (seenZone.has(zone.zone)) {
        ctx.addIssue({
          code: 'custom',
          path: ['hrZones', i, 'zone'],
          message: `There is already a zone ${zone.zone}.`,
        })
      }
      seenZone.add(zone.zone)
    })

    if (draft.endTime && draft.startTime && draft.endTime < draft.startTime) {
      /* Not an error: a run that starts at 23:40 and ends at 00:12 is a real run, and
       * `occurred_on` already pins which day it belongs to. Nothing to add. */
    }
  })

export type ReviewDraftInput = z.infer<typeof ReviewDraftSchema>

/* ============================================================================
 * §3 The commit payload
 * ==========================================================================*/

/**
 * `runId` present = a post-review edit (R-8, `/r/[id]/edit`); absent = the first commit
 * (`/x/[extractionId]`). The server never takes the client's word for which one it is beyond
 * this — it re-reads the run and re-derives the baseline before diffing.
 *
 * **The envelope and the draft are validated in two steps, deliberately.** Parsing them as one
 * nested object would prefix every issue path with `draft.`, and the screen looks its errors up by
 * the draft's own dot-path syntax (`splits.0.timeSec`) — so a nested parse would silently deliver
 * errors nothing renders. Two parses keep the draft's paths draft-relative by construction rather
 * than by a `slice(6)` somebody later has to notice.
 */
export const CommitReviewEnvelopeSchema = z.object({
  extractionId: z.string().min(1).max(64).nullable(),
  runId: z.string().min(1).max(64).nullable(),
  draft: z.unknown(),
})

/** The whole payload in one schema, for callers that want it — the action uses the two above. */
export const CommitReviewPayloadSchema = CommitReviewEnvelopeSchema.extend({
  draft: ReviewDraftSchema,
})

export type CommitReviewPayload = z.infer<typeof CommitReviewPayloadSchema>

/* ============================================================================
 * §4 Draft -> the row
 * ==========================================================================*/

/**
 * The unit conversion (D5) and the two derivations, in one place.
 *
 * **`avgPaceSec` is stored, not recomputed on read** (roadmap §4.3), and it is taken from the
 * reviewed value when there is one. That is deliberate and it is the reason CHK-3 exists at all:
 * Apple prints its own average pace, the reviewer confirms *that number* against the screenshot,
 * and CHK-3 is what tells them when it disagrees with distance and duration. Always deriving
 * would make the stored value unfalsifiable and CHK-3 a check on nothing. Derivation is the
 * fallback for the summary-less upload where no pace was ever printed.
 */
export function toRunInput(
  draft: ReviewDraftInput,
  options: { source: RunSource; extractionId: string | null },
): NewRunInput {
  const distanceM = Math.round(draft.distanceKm * 1000)
  const avgPaceSec =
    draft.avgPaceSecPerKm ?? Math.round(draft.durationSec / (distanceM / 1000)) ?? 0

  return {
    occurredOn: draft.occurredOn,
    startedAt: widenTime(draft.startTime),
    endedAt: widenTime(draft.endTime),
    activityType: draft.activityType ?? 'Outdoor Run',
    location: draft.location,
    durationSec: draft.durationSec,
    distanceM,
    activeKcal: draft.activeKcal,
    totalKcal: draft.totalKcal,
    elevationM: draft.elevationGainM,
    avgCadence: draft.avgCadenceSpm,
    avgPaceSec,
    avgHr: draft.avgHrBpm,
    maxHr: draft.maxHrBpm,
    restingHr: draft.restingHrBpm,
    intent: draft.intent,
    // R-9 — positional, because that is how Apple prints them: end of run, then +1 min. The
    // +2 min reading is reviewable and gets no column, by ruling.
    endHrBpm: draft.postWorkoutHr[0]?.bpm ?? null,
    hr1MinPostBpm: draft.postWorkoutHr[1]?.bpm ?? null,
    note: draft.note,
    source: options.source,
    extractionId: options.extractionId,
    splits: draft.splits.map((s) => ({
      km: s.km,
      timeSec: s.timeSec,
      paceSec: s.paceSecPerKm,
      hr: s.hrBpm,
      cadence: s.cadenceSpm,
      partial: s.partial,
    })),
    zones: draft.hrZones.map((z) => ({
      zone: z.zone,
      durationSec: z.durationSec,
      minBpm: z.minBpm,
      maxBpm: z.maxBpm,
    })),
  }
}

/* ============================================================================
 * §5 Errors, in the shape the screen renders them
 * ==========================================================================*/

/** Keyed by the same dot-path syntax `lib/review/draft.ts` §3 defines, so a field finds its own. */
export type ReviewFieldErrors = Record<string, string>

export function fieldErrorsOf(error: z.ZodError): ReviewFieldErrors {
  const out: ReviewFieldErrors = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'form'
    if (!(path in out)) out[path] = issue.message
  }
  return out
}

/** What `commitReviewAction` hands back to `useActionState`. */
export type CommitReviewState =
  | { status: 'idle' }
  | { status: 'error'; message: string; fieldErrors: ReviewFieldErrors }
  | { status: 'duplicate'; message: string; existingRunId: string | null }

export const IDLE_COMMIT_STATE: CommitReviewState = { status: 'idle' }
