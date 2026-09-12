import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from 'drizzle-orm'

import { type DateISO } from '@/lib/date/ranges'
import { newRunId } from '@/lib/id'

import { db } from '../index'
import {
  runPhotos,
  runSplits,
  runZones,
  runs,
  type NewRunSplit,
  type NewRunZone,
  type Run,
  type RunIntent,
  type RunPhoto,
  type RunSplit,
  type RunZone,
} from '../schema'

import { DuplicateRunError, NotFoundError, isUniqueViolation } from './errors'
import { type Statement, runBatch } from './internal'
import {
  assertExtractionOwned,
  runPhotoOwnedBy,
  runSplitOwnedBy,
  runZoneOwnedBy,
} from './ownership'

/* ============================================================================
 * §4 Runs — the review commit, the duplicate guard, reads and corrections
 * ==========================================================================*/

/**
 * Everything the review screen has confirmed. Note what is NOT here: `reviewedAt` (this function
 * sets it), `avgPaceSec` is required because it is derived once in TypeScript at commit time
 * (roadmap D5), and there are no optional numeric strings — F05's Zod schema has already turned
 * the extraction into integers.
 */
export interface NewRunInput {
  occurredOn: DateISO
  startedAt: string | null // 'HH:MM:SS'
  endedAt: string | null
  activityType: string
  location: string | null
  durationSec: number
  distanceM: number
  activeKcal: number | null
  totalKcal: number | null
  elevationM: number | null
  avgCadence: number | null
  avgPaceSec: number
  avgHr: number | null
  maxHr: number | null
  restingHr: number | null
  intent: RunIntent | null
  /** R-9 — postWorkoutHr[0] and [1]; together they are hrRecovery1MinBpm. */
  endHrBpm: number | null
  hr1MinPostBpm: number | null
  note: string | null
  source: 'screenshot' | 'manual'
  extractionId: string | null
  splits: Omit<NewRunSplit, 'runId'>[]
  zones: Omit<NewRunZone, 'runId'>[]
}

/**
 * **R-1: this is the ONLY place a `runs` row is created.** It is called by F05's `commitReview`
 * when the human confirms the extracted numbers — not at upload. There is no placeholder row and
 * never was one: at upload time `occurred_on` (NOT NULL) has not been extracted yet, so a
 * placeholder needs a placeholder date, and two uploads on the same day would then collide on
 * the R-5 dedupe index — which is precisely what a runner does after two weekend runs.
 *
 * One `db.batch`, therefore one transaction:
 *   1. INSERT the run, with `reviewed_at` set (D1: a stored run is a confirmed run)
 *   2. INSERT its splits and zones
 *   3. Backfill `run_photos.run_id` for the photos that have been hanging off the extraction
 *      since upload
 *
 * Throws `DuplicateRunError` when the dedupe index refuses it.
 */
export async function commitExtractedRun(
  userId: string,
  input: NewRunInput,
  options: { reviewedAt?: Date } = {},
): Promise<{ runId: string }> {
  const runId = newRunId()
  const { splits, zones, ...runFields } = input
  const reviewedAt = options.reviewedAt ?? new Date()

  const statements: Statement[] = [
    db.insert(runs).values({ id: runId, userId, reviewedAt, ...runFields }),
  ]
  if (splits.length > 0) {
    statements.push(db.insert(runSplits).values(splits.map((s) => ({ ...s, runId }))))
  }
  if (zones.length > 0) {
    statements.push(db.insert(runZones).values(zones.map((z) => ({ ...z, runId }))))
  }
  if (input.extractionId) {
    // Scoped by the extraction's own ownership, checked below before we get here, and narrowed
    // to rows not already claimed by another run so a re-commit cannot steal photos.
    statements.push(
      db
        .update(runPhotos)
        .set({ runId })
        .where(and(eq(runPhotos.extractionId, input.extractionId), isNull(runPhotos.runId))),
    )
  }

  if (input.extractionId) await assertExtractionOwned(userId, input.extractionId)

  try {
    await runBatch(statements)
    return { runId }
  } catch (err) {
    if (isUniqueViolation(err)) {
      const existing = await findRunByOccurredAndStarted(userId, input.occurredOn, input.startedAt)
      throw new DuplicateRunError(existing?.id ?? null)
    }
    throw err
  }
}

/** Scoped lookup used only to enrich the R-5 duplicate error with a linkable run id. */
async function findRunByOccurredAndStarted(
  userId: string,
  occurredOn: DateISO,
  startedAt: string | null,
): Promise<{ id: string } | undefined> {
  const rows = await db
    .select({ id: runs.id })
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        eq(runs.occurredOn, occurredOn),
        sql`coalesce(${runs.startedAt}, '00:00:00'::time) = coalesce(${startedAt}::time, '00:00:00'::time)`,
      ),
    )
    .limit(1)
  return rows[0]
}

/**
 * The post-review edit (R-8), `/r/[id]/edit`. Sets `corrected_at` — never `reviewed_at`, which is
 * written once and answers a different question ("has a human ever confirmed this?").
 *
 * Splits and zones are REPLACED wholesale when supplied, for the same reason records are (D7): a
 * km renumbered by a correction cannot be safely upserted against its old composite key, and a
 * split the human deleted must actually disappear. Passing `undefined` leaves them untouched;
 * passing `[]` deletes them.
 */
export async function applyRunCorrections(
  userId: string,
  runId: string,
  patch: Partial<Omit<NewRunInput, 'splits' | 'zones'>>,
  replacementSplits?: Omit<NewRunSplit, 'runId'>[],
  replacementZones?: Omit<NewRunZone, 'runId'>[],
): Promise<void> {
  const statements: Statement[] = [
    db
      .update(runs)
      .set({ ...patch, correctedAt: new Date() })
      .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
      .returning({ id: runs.id }),
  ]

  if (replacementSplits) {
    statements.push(db.delete(runSplits).where(eq(runSplits.runId, runId)))
    if (replacementSplits.length > 0) {
      statements.push(db.insert(runSplits).values(replacementSplits.map((s) => ({ ...s, runId }))))
    }
  }
  if (replacementZones) {
    statements.push(db.delete(runZones).where(eq(runZones.runId, runId)))
    if (replacementZones.length > 0) {
      statements.push(db.insert(runZones).values(replacementZones.map((z) => ({ ...z, runId }))))
    }
  }

  try {
    const results = await runBatch(statements)
    // The UPDATE is first, and its RETURNING is empty when the run is missing OR not ours — the
    // child DELETEs in the same batch then rolled back with it, so nothing was orphaned.
    const updated = (results[0] ?? []) as { id: string }[]
    if (updated.length === 0) throw new NotFoundError('Run not found')
  } catch (err) {
    if (isUniqueViolation(err)) {
      const occurredOn = patch.occurredOn
      const existing = occurredOn
        ? await findRunByOccurredAndStarted(userId, occurredOn, patch.startedAt ?? null)
        : undefined
      throw new DuplicateRunError(existing?.id ?? null)
    }
    throw err
  }
}

/**
 * The five values `runs.intent` may hold, as a list a `<select>` or a chip row can iterate.
 *
 * The TYPE lives in `./schema` (F03 owns it, and the column is typed against it). This is only the
 * runtime tuple, and the `satisfies` keeps the two from drifting: drop a member from either and the
 * compiler objects here rather than at the one call site that happened to use it.
 */
export const RUN_INTENTS = [
  'easy',
  'tempo',
  'long',
  'race',
  'unspecified',
] as const satisfies readonly RunIntent[]

/**
 * `runs.intent`, and nothing else.
 *
 * **Why this is not `applyRunCorrections`.** That function sets `corrected_at`, which answers "when
 * did a human last change a number the model read off a screenshot" (R-8). Intent is not such a
 * number: nothing extracted it, no correction log entry describes it, and it is the runner
 * answering F07's `questionForRunner` about a run whose measurements are already confirmed.
 * Routing it through the corrections path would stamp `corrected_at` on a run nobody corrected and
 * quietly pollute the extraction error profile that `getExtractionErrorProfile` reads.
 *
 * `null` clears it — a mis-tap on a phone must be undoable, and "unspecified" is a real answer
 * distinct from "not answered".
 */
export async function setRunIntent(
  userId: string,
  runId: string,
  intent: RunIntent | null,
): Promise<void> {
  const rows = await db
    .update(runs)
    .set({ intent, updatedAt: new Date() })
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
    .returning({ id: runs.id })
  if (rows.length === 0) throw new NotFoundError('Run not found')
}

export interface RunDetail extends Run {
  splits: RunSplit[]
  zones: RunZone[]
  photos: RunPhoto[]
}

/**
 * The full-run read: **four statements, one `db.batch`, one HTTP round trip, one snapshot.**
 *
 * The snapshot matters as much as the round trip — a concurrent correction cannot change the
 * splits between reading the run row and reading its splits. This is the only sanctioned way to
 * read a run with its children; no caller may issue a per-split or per-zone query.
 *
 * Draft-visible by design: no `reviewed_at` filter, because `/r/[id]` must render a run whatever
 * its review state.
 */
export async function getRunDetail(userId: string, runId: string): Promise<RunDetail | null> {
  const [runRows, splitRows, zoneRows, photoRows] = await db.batch([
    db
      .select()
      .from(runs)
      .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
      .limit(1),

    db
      .select()
      .from(runSplits)
      .where(and(eq(runSplits.runId, runId), runSplitOwnedBy(userId)))
      .orderBy(asc(runSplits.km)),

    db
      .select()
      .from(runZones)
      .where(and(eq(runZones.runId, runId), runZoneOwnedBy(userId)))
      .orderBy(asc(runZones.zone)),

    db
      .select()
      .from(runPhotos)
      .where(and(eq(runPhotos.runId, runId), runPhotoOwnedBy(userId)))
      .orderBy(asc(runPhotos.sortOrder), asc(runPhotos.createdAt)),
  ])

  const run = runRows[0]
  if (!run) return null
  return { ...run, splits: splitRows, zones: zoneRows, photos: photoRows }
}

/** Reviewed-only (D16). Newest first, for "/". F08 groups by `isoWeekKeyOf(occurredOn)`. */
export async function listRuns(
  userId: string,
  opts: { limit?: number; beforeOccurredOn?: DateISO } = {},
): Promise<Run[]> {
  const limit = opts.limit ?? 50
  return db
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        opts.beforeOccurredOn ? lt(runs.occurredOn, opts.beforeOccurredOn) : undefined,
      ),
    )
    .orderBy(desc(runs.occurredOn), desc(runs.startedAt))
    .limit(limit)
}

/** A list row: the run, plus how many screenshots it was read from. */
export interface RunWithPhotoCount extends Run {
  photoCount: number
}

/**
 * `/`'s list read: reviewed-only, newest first, **with each run's screenshot count in the same
 * statement**.
 *
 * A `LEFT JOIN ... GROUP BY` rather than a second query keyed on the returned ids, for the reason
 * `lib/db/queries/rollups` gives for every aggregate: two statements answering one screen's
 * question is two chances to disagree, and it is also a second HTTP round trip on the app's
 * landing page. The join multiplies each run by its photos (three, at most, per F04) before
 * collapsing them, which is a few dozen rows for a 60-run page.
 *
 * `beforeOccurredOn` is the §2.1 cursor: `/` renders one page and offers "earlier runs" rather
 * than building virtualisation for a dataset that is ~200 rows a YEAR.
 */
export async function listRunsWithPhotoCounts(
  userId: string,
  opts: { limit?: number; beforeOccurredOn?: DateISO } = {},
): Promise<RunWithPhotoCount[]> {
  const limit = opts.limit ?? 60
  return db
    .select({
      ...getTableColumns(runs),
      photoCount: sql<number>`count(${runPhotos.id})`.mapWith(Number),
    })
    .from(runs)
    .leftJoin(runPhotos, eq(runPhotos.runId, runs.id))
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        opts.beforeOccurredOn ? lt(runs.occurredOn, opts.beforeOccurredOn) : undefined,
      ),
    )
    .groupBy(runs.id)
    .orderBy(desc(runs.occurredOn), desc(runs.startedAt))
    .limit(limit)
}

/** Resolves the run an extraction produced — F04's poll endpoint redirects on this. */
export async function getRunIdForExtraction(
  userId: string,
  extractionId: string,
): Promise<string | null> {
  const rows = await db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.extractionId, extractionId), eq(runs.userId, userId)))
    .limit(1)
  return rows[0]?.id ?? null
}

/**
 * Cascades away splits, zones, photos and shares. `records.run_id` cascades too, which is safe
 * because F06 recomputes records wholesale (D7); `badges.run_id` is SET NULL (R-22), so badge
 * history survives — a badge is a fact about the past, not a pointer.
 */
export async function deleteRun(userId: string, runId: string): Promise<void> {
  const rows = await db
    .delete(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
    .returning({ id: runs.id })
  if (rows.length === 0) throw new NotFoundError('Run not found')
}

/**
 * The card summary for runs attached to Nina messages (F33 R13). One statement, `inArray`, scoped
 * to the owner like every read in this layer except `getRunByShareToken`.
 *
 * **Draft-visible, and `reviewedAt` is returned rather than filtered.** `/r/[id]` renders a run
 * whatever its review state, so an unreviewed run can be on screen when the attach button is; the
 * *caller* decides what to do about that, and both callers do the same thing — refuse to attach an
 * unreviewed run, because Nina's facts come from the reviewed history (D16) and a run she cannot
 * see is a card she cannot talk about. Returning the column instead of filtering on it keeps that
 * decision in one place and makes the refusal explicit rather than an empty result.
 *
 * Not `getRunDetail` in a loop: a conversation can hold dozens of attachments and `getRunDetail`
 * is four statements *per run*, for children a card has no use for.
 *
 * No `orderBy`: the caller indexes the rows by id and looks them up per message.
 */
export interface RunAttachmentRow {
  id: string
  occurredOn: string
  location: string | null
  activityType: string
  distanceM: number
  durationSec: number
  avgPaceSec: number
  reviewedAt: Date | null
}

export async function listRunAttachments(
  userId: string,
  runIds: readonly string[],
): Promise<RunAttachmentRow[]> {
  if (runIds.length === 0) return []

  return db
    .select({
      id: runs.id,
      occurredOn: runs.occurredOn,
      location: runs.location,
      activityType: runs.activityType,
      distanceM: runs.distanceM,
      durationSec: runs.durationSec,
      avgPaceSec: runs.avgPaceSec,
      reviewedAt: runs.reviewedAt,
    })
    .from(runs)
    .where(and(eq(runs.userId, userId), inArray(runs.id, [...runIds])))
}
