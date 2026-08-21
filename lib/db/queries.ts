import type { BatchItem } from 'drizzle-orm/batch'
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  sql,
} from 'drizzle-orm'
import { getTableColumns } from 'drizzle-orm'

import {
  addMonths,
  isoWeekRange,
  monthRange,
  type DateISO,
  type IsoWeekKey,
  type MonthKey,
} from '@/lib/date/ranges'
import { newExtractionId, newInsightId, newPhotoId, newRunId, newShareToken } from '@/lib/id'
import { db } from './index'
import {
  badges,
  extractions,
  insights,
  profiles,
  records,
  runPhotos,
  runSplits,
  runZones,
  runs,
  shares,
  users,
  type Badge,
  type Extraction,
  type ExtractionBlobUrls,
  type ExtractionCorrections,
  type ExtractionStatus,
  type Insight,
  type InsightScope,
  type NewProfile,
  type NewRecordRow,
  type NewRunSplit,
  type NewRunZone,
  type PhotoKind,
  type Profile,
  type RecordRow,
  type Run,
  type RunIntent,
  type RunPhoto,
  type RunSplit,
  type RunZone,
  type Share,
} from './schema'

/**
 * Every read and write the application performs, in one module.
 *
 * ## Two invariants govern this file
 *
 * **1. The userId-scoping invariant (roadmap D8).** Every exported function takes `userId` as its
 * first parameter and that value appears in the `WHERE` of every statement it runs. There is
 * exactly ONE exception — `getRunByShareToken` (§9), which is unscoped by contract because the
 * 96-bit token *is* the credential. Never add a second. `userId` must come from the session
 * (F02's `requireUserId()`), never from a Server Action argument, a form field or a URL segment.
 *
 * A row that exists but is not yours and a row that does not exist are the SAME outcome
 * (`NotFoundError` → 404). Distinguishing them is an id-enumeration oracle.
 *
 * **2. The reviewed-data invariant (roadmap D16 / R-13).** Every rollup, list, chart input,
 * record input and badge input filters `runs.reviewed_at IS NOT NULL`. The split between
 * draft-visible and reviewed-only reads is a contract, not an accident, and
 * `tests/db.queries.reviewedOnly.test.ts` asserts it function by function — because the failure
 * mode (a missing filter on the eleventh query) is silent and produces a plausible wrong number.
 *
 * ## Why `db.batch` and never `db.transaction`
 *
 * `db.transaction()` throws on the neon-http driver. `db.batch([...])` is one HTTP request that
 * Postgres runs inside one transaction, which buys atomicity AND a single round trip. Every
 * multi-statement write below uses it.
 */

/* ============================================================================
 * §1 Errors
 * ==========================================================================*/

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const
  constructor(message = 'Not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

/**
 * Thrown when the R-5 dedupe index refuses a second run for the same user, day and start time.
 * `existingRunId` is looked up AFTER the index has already said no, purely so the UI can link to
 * the run the user already has. Never check-then-insert: two tabs committing the same extraction
 * would race through the check, and the index cannot race itself.
 */
export class DuplicateRunError extends Error {
  readonly code = 'DUPLICATE_RUN' as const
  constructor(readonly existingRunId: string | null) {
    super('A run already exists for this date and start time')
    this.name = 'DuplicateRunError'
  }
}

/** Postgres SQLSTATE 23505. Neon surfaces it on `err.code`; some wrappers nest it on `.cause`. */
export function isUniqueViolation(err: unknown): boolean {
  const seen = new Set<unknown>()
  let current: unknown = err
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const record = current as { code?: unknown; cause?: unknown; sourceError?: unknown }
    if (record.code === '23505') return true
    current = record.cause ?? record.sourceError
  }
  return false
}

/* ============================================================================
 * §2 Batch plumbing
 * ==========================================================================*/

type Statement = BatchItem<'pg'>

/**
 * `db.batch` is typed for a non-empty tuple, which a conditionally-built statement list is not.
 * This is the one place the cast lives, so no call site has to repeat it. An empty list is a
 * no-op rather than a runtime error, which keeps callers free of `if (statements.length)`.
 */
async function runBatch(statements: Statement[]): Promise<unknown[]> {
  if (statements.length === 0) return []
  return (await db.batch(statements as [Statement, ...Statement[]])) as unknown[]
}

/* ============================================================================
 * §3 Ownership predicates — THE security primitive
 *
 * run_splits, run_zones and run_photos carry no user_id: the composite natural key is the point
 * of those tables, and duplicating the owner into them would be a second source of truth that
 * can drift. Ownership is proved by a correlated EXISTS back to `runs` IN THE SAME STATEMENT, so
 * there is no window between the check and the write.
 * ==========================================================================*/

export function runSplitOwnedBy(userId: string) {
  return exists(
    db
      .select({ ok: sql`1` })
      .from(runs)
      .where(and(eq(runs.id, runSplits.runId), eq(runs.userId, userId))),
  )
}

export function runZoneOwnedBy(userId: string) {
  return exists(
    db
      .select({ ok: sql`1` })
      .from(runs)
      .where(and(eq(runs.id, runZones.runId), eq(runs.userId, userId))),
  )
}

/**
 * A photo may be owned through EITHER parent: before the review commit it only has an
 * extraction, after it also has a run. Both branches are scoped to the same user, so a photo is
 * "mine" if either of my parents claims it — and unreachable otherwise.
 */
export function runPhotoOwnedBy(userId: string) {
  return sql`(${exists(
    db
      .select({ ok: sql`1` })
      .from(extractions)
      .where(and(eq(extractions.id, runPhotos.extractionId), eq(extractions.userId, userId))),
  )} or ${exists(
    db
      .select({ ok: sql`1` })
      .from(runs)
      .where(and(eq(runs.id, runPhotos.runId), eq(runs.userId, userId))),
  )})`
}

/** Proof-before-write, for any mutation that touches a child table. Throws, never returns false. */
export async function assertRunOwned(userId: string, runId: string): Promise<void> {
  const rows = await db
    .select({ ok: sql<number>`1`.mapWith(Number) })
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
    .limit(1)
  if (rows.length === 0) throw new NotFoundError('Run not found')
}

export async function assertExtractionOwned(userId: string, extractionId: string): Promise<void> {
  const rows = await db
    .select({ ok: sql<number>`1`.mapWith(Number) })
    .from(extractions)
    .where(and(eq(extractions.id, extractionId), eq(extractions.userId, userId)))
    .limit(1)
  if (rows.length === 0) throw new NotFoundError('Extraction not found')
}

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
 * §5 gives for every aggregate here: two statements answering one screen's question is two chances
 * to disagree, and it is also a second HTTP round trip on the app's landing page. The join
 * multiplies each run by its photos (three, at most, per F04) before collapsing them, which is a
 * few dozen rows for a 60-run page.
 *
 * `beforeOccurredOn` is the §2.1 cursor: `/` renders one page and offers "earlier runs" rather than
 * building virtualisation for a dataset that is ~200 rows a YEAR.
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

/* ============================================================================
 * §5 Rollups — all reviewed-only, all range-scanned
 *
 * Every one of these filters `occurred_on >= start AND occurred_on < endExclusive` rather than
 * `to_char(occurred_on, 'YYYY-MM') = key`. Same rows; only the first can use
 * `runs_user_occurred_idx`.
 * ==========================================================================*/

export interface RunAggregate {
  runCount: number
  distanceM: number
  durationSec: number
}

/** Runs in one ISO week ('2026-W34'), reviewed-only, oldest first. */
export async function getRunsInIsoWeek(userId: string, week: IsoWeekKey): Promise<Run[]> {
  const { startISO, endExclusiveISO } = isoWeekRange(week)
  return db
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        gte(runs.occurredOn, startISO),
        lt(runs.occurredOn, endExclusiveISO),
      ),
    )
    .orderBy(asc(runs.occurredOn), asc(runs.startedAt))
}

/** Runs in one calendar month ('2026-08'), reviewed-only, oldest first. */
export async function getRunsInMonth(userId: string, month: MonthKey): Promise<Run[]> {
  const { startISO, endExclusiveISO } = monthRange(month)
  return db
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        gte(runs.occurredOn, startISO),
        lt(runs.occurredOn, endExclusiveISO),
      ),
    )
    .orderBy(asc(runs.occurredOn), asc(runs.startedAt))
}

/**
 * Runs in an arbitrary half-open day range, reviewed-only. R-6's ACWR needs a rolling 7-day and
 * 28-day window, which is neither a calendar month nor an ISO week.
 */
export async function getRunsBetween(
  userId: string,
  startISO: DateISO,
  endExclusiveISO: DateISO,
): Promise<Run[]> {
  return db
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        gte(runs.occurredOn, startISO),
        lt(runs.occurredOn, endExclusiveISO),
      ),
    )
    .orderBy(asc(runs.occurredOn), asc(runs.startedAt))
}

/** One reviewed run and its children, as F06's record recompute reads them. */
export interface ReviewedRunWithChildren extends Run {
  splits: RunSplit[]
  zones: RunZone[]
}

/**
 * **Every reviewed run a user has, with its splits and zones — three statements, one `db.batch`,
 * one snapshot.** F06's `recomputeRecords` is the only caller, and it needs the whole history:
 * records are recomputed wholesale, never incremented (roadmap §4.5 / R-10), because a correction
 * that drops a run below a qualifier can only be expressed by re-deriving the set from scratch.
 *
 * Reviewed-only (D16). A record set by an unconfirmed extraction is a record set by a number
 * nobody vouched for.
 *
 * Three statements rather than one join: a join would multiply the run row by its eleven splits
 * and five zones and hand back ~55 rows per run to be de-duplicated in TypeScript. At 17 runs a
 * month the whole history is a few hundred rows across three flat result sets, and the batch
 * makes them one consistent snapshot — a concurrent correction cannot land between the splits
 * read and the zones read.
 */
export async function getReviewedRunsWithChildren(
  userId: string,
): Promise<ReviewedRunWithChildren[]> {
  const reviewedRunOf = (child: typeof runSplits | typeof runZones) =>
    exists(
      db
        .select({ ok: sql`1` })
        .from(runs)
        .where(and(eq(runs.id, child.runId), eq(runs.userId, userId), isNotNull(runs.reviewedAt))),
    )

  const [runRows, splitRows, zoneRows] = await db.batch([
    db
      .select()
      .from(runs)
      .where(and(eq(runs.userId, userId), isNotNull(runs.reviewedAt)))
      .orderBy(asc(runs.occurredOn), asc(runs.startedAt)),

    db
      .select()
      .from(runSplits)
      .where(reviewedRunOf(runSplits))
      .orderBy(asc(runSplits.runId), asc(runSplits.km)),

    db
      .select()
      .from(runZones)
      .where(reviewedRunOf(runZones))
      .orderBy(asc(runZones.runId), asc(runZones.zone)),
  ])

  const splitsByRun = new Map<string, RunSplit[]>()
  for (const s of splitRows) {
    const list = splitsByRun.get(s.runId)
    if (list) list.push(s)
    else splitsByRun.set(s.runId, [s])
  }
  const zonesByRun = new Map<string, RunZone[]>()
  for (const z of zoneRows) {
    const list = zonesByRun.get(z.runId)
    if (list) list.push(z)
    else zonesByRun.set(z.runId, [z])
  }

  return runRows.map((run) => ({
    ...run,
    splits: splitsByRun.get(run.id) ?? [],
    zones: zonesByRun.get(run.id) ?? [],
  }))
}

export interface MonthlyTotal extends RunAggregate {
  month: MonthKey
}

/**
 * The last `months` months ending at `anchorMonth` inclusive, oldest → newest, zero-filled.
 *
 * `anchorMonth` is an explicit parameter and is never derived from the wall clock here: the
 * caller computes a Jakarta "today" once, so a render that straddles midnight cannot produce two
 * different answers for the same page.
 *
 * `SUM(integer)` returns `bigint`, which `@neondatabase/serverless` hands back as a **string** —
 * storing metres as an integer does not make the aggregate immune. Hence `.mapWith(Number)` on
 * every aggregate in this section; the integration suite asserts `typeof === 'number'`.
 */
export async function getMonthlyTotals(
  userId: string,
  months: number,
  anchorMonth: MonthKey,
): Promise<MonthlyTotal[]> {
  if (!Number.isInteger(months) || months < 1 || months > 60) {
    throw new RangeError(`months must be an integer in 1..60, got ${months}`)
  }
  const firstMonth = addMonths(anchorMonth, -(months - 1))
  const { startISO } = monthRange(firstMonth)
  const { endExclusiveISO } = monthRange(anchorMonth)
  const monthExpr = sql<string>`to_char(${runs.occurredOn}, 'YYYY-MM')`

  const rows = await db
    .select({
      month: monthExpr,
      runCount: sql<number>`count(*)`.mapWith(Number),
      distanceM: sql<number>`coalesce(sum(${runs.distanceM}), 0)`.mapWith(Number),
      durationSec: sql<number>`coalesce(sum(${runs.durationSec}), 0)`.mapWith(Number),
    })
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        gte(runs.occurredOn, startISO),
        lt(runs.occurredOn, endExclusiveISO),
      ),
    )
    .groupBy(monthExpr)

  return fillZeroMonths(rows, anchorMonth, months)
}

/**
 * Pure, exported, and unit-tested without a database. A month with no runs must appear as a zero
 * rather than be absent: a trend chart that silently drops empty months draws a flat line
 * through a lay-off instead of showing it.
 */
export function fillZeroMonths(
  rows: ReadonlyArray<{ month: string; runCount: number; distanceM: number; durationSec: number }>,
  anchorMonth: MonthKey,
  months: number,
): MonthlyTotal[] {
  const byMonth = new Map(rows.map((r) => [r.month, r]))
  const out: MonthlyTotal[] = []
  for (let i = months - 1; i >= 0; i--) {
    const month = addMonths(anchorMonth, -i)
    const row = byMonth.get(month)
    out.push({
      month,
      runCount: row?.runCount ?? 0,
      distanceM: row?.distanceM ?? 0,
      durationSec: row?.durationSec ?? 0,
    })
  }
  return out
}

export interface AllTimeTotals extends RunAggregate {
  firstRunOn: DateISO | null
  lastRunOn: DateISO | null
}

/** Lifetime totals, reviewed-only. Powers `/me`. */
export async function getAllTimeTotals(userId: string): Promise<AllTimeTotals> {
  const rows = await db
    .select({
      runCount: sql<number>`count(*)`.mapWith(Number),
      distanceM: sql<number>`coalesce(sum(${runs.distanceM}), 0)`.mapWith(Number),
      durationSec: sql<number>`coalesce(sum(${runs.durationSec}), 0)`.mapWith(Number),
      firstRunOn: sql<string | null>`min(${runs.occurredOn})`,
      lastRunOn: sql<string | null>`max(${runs.occurredOn})`,
    })
    .from(runs)
    .where(and(eq(runs.userId, userId), isNotNull(runs.reviewedAt)))
  return rows[0] ?? { runCount: 0, distanceM: 0, durationSec: 0, firstRunOn: null, lastRunOn: null }
}

/**
 * Roadmap §4.4 rule 2 — the highest `runs.max_hr` ever observed. F02's `resolveHrMax` is the only
 * caller; no feature may compute HRmax any other way. Reads `runs_user_maxhr_idx` (R-12).
 */
export async function getObservedMaxHr(userId: string): Promise<number | null> {
  const rows = await db
    .select({ value: sql<number | null>`max(${runs.maxHr})` })
    .from(runs)
    .where(and(eq(runs.userId, userId), isNotNull(runs.reviewedAt)))
  const value = rows[0]?.value
  return value == null ? null : Number(value)
}

/**
 * The same lookup with one run held out. R-3 is emphatic that metrics resolve observed-first,
 * including the run's own max — so this exists for exactly one caller: F09's `new_ceiling` badge,
 * which asks "did this run beat the previous best?" and genuinely needs the previous best.
 * **Not for metrics.** Using it there would reintroduce the formula estimate precisely where the
 * measurement is strongest.
 */
export async function getObservedMaxHrExcludingRun(
  userId: string,
  runId: string,
): Promise<number | null> {
  const rows = await db
    .select({ value: sql<number | null>`max(${runs.maxHr})` })
    .from(runs)
    .where(and(eq(runs.userId, userId), isNotNull(runs.reviewedAt), sql`${runs.id} <> ${runId}`))
  const value = rows[0]?.value
  return value == null ? null : Number(value)
}

/** Which run holds the observed max, not just what it was. See `getObservedMaxHrRun`. */
export interface ObservedMaxHr {
  runId: string
  maxHr: number
  occurredOn: DateISO
}

/**
 * The attributed form of `getObservedMaxHr`, and the only query `lib/metrics/hrMax.ts` uses for
 * rule 2 of roadmap §4.4. Three things it does that the plain `max()` above cannot:
 *
 *   - **Names the run.** F02 §4.5's transition banner says *"your watch recorded 189 bpm on this
 *     run"*; that sentence needs an id and a date, not a number.
 *   - **Filters in SQL, not in TypeScript.** `minBpm` is the Tanaka estimate. Roadmap §4.4 does
 *     not say "prefer whichever number loaded first" — it says an observation wins when it
 *     *exceeds* the formula, and `ORDER BY max_hr DESC LIMIT 1` over that predicate is that rule,
 *     expressed once. Never fetch runs and reduce over them in application code.
 *   - **Takes an `asOf` cutoff**, which is the whole of `resolveHrMaxAsOf`: "what was true then"
 *     is this same query with one more predicate, not a second algorithm.
 *
 * Reads `runs_user_maxhr_idx` (R-12). Reviewed-only (D16): an unreviewed max HR is a number a
 * vision model asserted and no human confirmed, and it would move the denominator under every
 * %HRmax figure in the app.
 */
export async function getObservedMaxHrRun(
  userId: string,
  options: { minBpm?: number; asOf?: DateISO } = {},
): Promise<ObservedMaxHr | null> {
  const { minBpm = 0, asOf } = options
  const rows = await db
    .select({ runId: runs.id, maxHr: runs.maxHr, occurredOn: runs.occurredOn })
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        isNotNull(runs.maxHr),
        gt(runs.maxHr, minBpm),
        asOf ? lte(runs.occurredOn, asOf) : undefined,
      ),
    )
    .orderBy(desc(runs.maxHr))
    .limit(1)
  const row = rows[0]
  if (!row || row.maxHr == null) return null
  return { runId: row.runId, maxHr: row.maxHr, occurredOn: row.occurredOn }
}

/**
 * One run, no children. `getRunDetail` is the right call for a page; this is for the callers that
 * only need a column or two off the parent row — F02's `hrMaxTransitionAt` wants `occurred_on` and
 * nothing else, and paying for four statements and eleven splits to get it would be silly.
 *
 * Draft-visible, exactly like `getRunDetail`: the reviewed-data invariant governs aggregates, not
 * "show me this row".
 */
export async function getRun(userId: string, runId: string): Promise<Run | null> {
  const rows = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

/**
 * The reviewed run immediately before `occurredOn`. F02's `hrMaxTransitionAt` compares "what HRmax
 * resolved to as of the previous run" against "as of this one"; that comparison needs a
 * predecessor, and a runner's first run has none — which is why this returns `null` rather than
 * throwing.
 *
 * Reviewed-only (D16): an unreviewed row is not a point in the runner's history yet.
 */
export async function getPreviousReviewedRun(
  userId: string,
  occurredOn: DateISO,
): Promise<Run | null> {
  const rows = await db
    .select()
    .from(runs)
    .where(
      and(eq(runs.userId, userId), isNotNull(runs.reviewedAt), lt(runs.occurredOn, occurredOn)),
    )
    .orderBy(desc(runs.occurredOn))
    .limit(1)
  return rows[0] ?? null
}

/* ============================================================================
 * §5b F09's three badge reads
 *
 * All reviewed-only (D16), because a badge earned from an unreviewed extraction is a badge earned
 * from a hallucination. None of them adds an index: at ~17 runs a month, and with `user_id` leading
 * every index in §4.3, each is single-digit-millisecond work over one user's partition.
 * ==========================================================================*/

/**
 * A trailing-window row: only the columns the two window rules actually read, not a whole `Run`.
 *
 * Narrow on purpose. `toWindowRun` needs six numbers and a decoupling computed from the splits; a
 * `select()` of all 26 run columns would ship the note, the photos' worth of metadata and both
 * recovery readings across the wire to be discarded, and it would make this function's real
 * dependency on the schema invisible. The field list IS the documentation of what a window rule can
 * see.
 */
export interface ReviewedRunWindowRow {
  id: string
  occurredOn: DateISO
  startedAt: string | null
  distanceM: number
  durationSec: number
  avgHr: number | null
  avgPaceSec: number
  splits: RunSplit[]
}

/**
 * The trailing window `groundhog_day` and `boring_excellence` need: this run and the reviewed runs
 * immediately before it, newest first.
 *
 * **`upTo` is the committing run's own position, not "today".** A backfilled run closes the window
 * that ends at *it*, not the one that ends at the most recent run in the table — otherwise
 * reviewing an old Tuesday would ask whether last week's three runs were near-identical, which is a
 * question about a different three runs. The row-value comparison
 * `(occurred_on, coalesce(started_at, '00:00')) <= (day, time)` is the same total order the R-5
 * dedupe index imposes, so "before this run" means one thing across the whole codebase.
 *
 * `limit` is passed by the caller as `windowRuns + 1`: the extra row is read purely so the rule can
 * tell whether the window ending one run EARLIER already qualified, which is what stops a fourth
 * near-identical loop from re-earning `groundhog_day`. Two statements rather than one join, for the
 * reason `getReviewedRunsWithChildren` gives — a join would multiply each run by its eleven splits.
 */
export async function getReviewedRunWindow(
  userId: string,
  upTo: { occurredOn: DateISO; startedAt: string | null },
  limit: number,
): Promise<ReviewedRunWindowRow[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new RangeError(`limit must be 1..50, got ${limit}`)
  }
  const position = sql`(${runs.occurredOn}, coalesce(${runs.startedAt}, '00:00:00'::time))`
  const runRows = await db
    .select({
      id: runs.id,
      occurredOn: runs.occurredOn,
      startedAt: runs.startedAt,
      distanceM: runs.distanceM,
      durationSec: runs.durationSec,
      avgHr: runs.avgHr,
      avgPaceSec: runs.avgPaceSec,
    })
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        sql`${position} <= (${upTo.occurredOn}::date, ${upTo.startedAt ?? '00:00:00'}::time)`,
      ),
    )
    .orderBy(desc(runs.occurredOn), desc(sql`coalesce(${runs.startedAt}, '00:00:00'::time)`))
    .limit(limit)

  if (runRows.length === 0) return []

  const splitRows = await db
    .select()
    .from(runSplits)
    .where(
      and(
        inArray(
          runSplits.runId,
          runRows.map((r) => r.id),
        ),
        runSplitOwnedBy(userId),
      ),
    )
    .orderBy(asc(runSplits.runId), asc(runSplits.km))

  const byRun = new Map<string, RunSplit[]>()
  for (const split of splitRows) {
    const list = byRun.get(split.runId)
    if (list) list.push(split)
    else byRun.set(split.runId, [split])
  }
  return runRows.map((run) => ({ ...run, splits: byRun.get(run.id) ?? [] }))
}

/**
 * `dawn_patrol`'s lifetime count. A `time` comparison in SQL, not a fetch-and-filter: the predicate
 * is the rule (roadmap §4.6, "10 runs started before 06:00") and expressing it once in the query is
 * what keeps it from being restated in TypeScript.
 */
export async function countReviewedRunsStartedBefore(
  userId: string,
  time: string,
): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        isNotNull(runs.startedAt),
        sql`${runs.startedAt} < ${time}::time`,
      ),
    )
  return rows[0]?.n ?? 0
}

/**
 * `tourist`: has this location ever appeared on another reviewed run?
 *
 * `LIMIT 1` existence check, and no index on `location` — §4.3 declares none and F09 does not add
 * one. A personal log tops out in the low thousands of rows after years of daily running, and this
 * scans one user's partition of an index that already leads with `user_id`. Revisit only if `/me`
 * ever measures otherwise.
 *
 * Exact equality, deliberately not case-folded or trimmed: normalising here would be a second
 * opinion about what a location IS, and F05's review screen is where the string is confirmed.
 */
export async function hasOtherReviewedRunAtLocation(
  userId: string,
  location: string,
  excludeRunId: string,
): Promise<boolean> {
  const rows = await db
    .select({ ok: sql`1` })
    .from(runs)
    .where(
      and(
        eq(runs.userId, userId),
        isNotNull(runs.reviewedAt),
        eq(runs.location, location),
        sql`${runs.id} <> ${excludeRunId}`,
      ),
    )
    .limit(1)
  return rows.length > 0
}

/* ============================================================================
 * §6 Extractions — append-only (D3)
 *
 * There is no delete path in this module, and there never will be: every field a human corrects
 * in review is a labelled extraction failure — model said X, truth was Y, for a known field
 * against a known image. `runs` keeps only the corrected value; `raw_response` + `corrections`
 * are the only place the model's wrongness survives, which is what turns a month of uploads into
 * a queryable error profile instead of a feeling that "the prompt seems off".
 *
 * `scripts/check-extractions-append-only.mjs` enforces this in CI.
 * ==========================================================================*/

/**
 * `blobUrls` carries `{url, pathname, kind}` per screenshot rather than a bare URL list: `kind`
 * is what parameterises F04's provenance guard, and it has to come from our own upload record
 * rather than from the model's reply. See `extractions.blob_urls` in `schema.ts`.
 */
export async function createExtraction(
  userId: string,
  blobUrls: ExtractionBlobUrls,
  model: string,
): Promise<{ id: string }> {
  const id = newExtractionId()
  await db.insert(extractions).values({ id, userId, blobUrls, model, status: 'pending' })
  return { id }
}

export async function getExtraction(userId: string, id: string): Promise<Extraction | null> {
  const rows = await db
    .select()
    .from(extractions)
    .where(and(eq(extractions.id, id), eq(extractions.userId, userId)))
    .limit(1)
  return rows[0] ?? null
}

/** Newest first. The upload screen offers "you have an extraction still waiting" from this. */
export async function listExtractions(
  userId: string,
  opts: { limit?: number; status?: ExtractionStatus } = {},
): Promise<Extraction[]> {
  return db
    .select()
    .from(extractions)
    .where(
      and(
        eq(extractions.userId, userId),
        opts.status ? eq(extractions.status, opts.status) : undefined,
      ),
    )
    .orderBy(desc(extractions.createdAt))
    .limit(opts.limit ?? 20)
}

async function markExtraction(
  userId: string,
  id: string,
  patch: {
    status: ExtractionStatus
    rawResponse?: unknown
    promptTokens?: number | null
    errorCode?: string | null
  },
): Promise<void> {
  const rows = await db
    .update(extractions)
    .set({ ...patch, completedAt: new Date() })
    .where(and(eq(extractions.id, id), eq(extractions.userId, userId)))
    .returning({ id: extractions.id })
  if (rows.length === 0) throw new NotFoundError('Extraction not found')
}

/** Terminal state, written once. `promptTokens` is the D3 canary, stored for later audit. */
export async function markExtractionOk(
  userId: string,
  id: string,
  rawResponse: unknown,
  promptTokens: number | null,
): Promise<void> {
  await markExtraction(userId, id, { status: 'ok', rawResponse, promptTokens })
}

/**
 * The response needed one text-only repair round-trip (R-2) before it validated. Distinguished
 * from `ok` because a repaired extraction is a prompt-quality signal, not just a success.
 */
export async function markExtractionRepaired(
  userId: string,
  id: string,
  rawResponse: unknown,
  promptTokens: number | null,
): Promise<void> {
  await markExtraction(userId, id, { status: 'repaired', rawResponse, promptTokens })
}

/**
 * `promptTokens` is optional but is passed on the F04 path even here: a `token_floor` row whose
 * canary reads 141 is the difference, months later, between "the vendor dropped the images" and
 * "the model wrote bad JSON".
 */
export async function markExtractionFailed(
  userId: string,
  id: string,
  errorCode: string,
  rawResponse?: unknown,
  promptTokens?: number | null,
): Promise<void> {
  await markExtraction(userId, id, { status: 'failed', errorCode, rawResponse, promptTokens })
}

/**
 * R-20's stale-pending self-heal. A background job killed mid-flight (a deploy, a timeout past
 * the 55 s soft deadline, a cold-start eviction) leaves its row `pending` forever, and the upload
 * screen would poll it until the end of time. Returns the ids it closed out.
 */
export async function failStalePendingExtractions(
  userId: string,
  olderThan: Date,
  errorCode = 'STALE_PENDING',
): Promise<string[]> {
  const rows = await db
    .update(extractions)
    .set({ status: 'failed', errorCode, completedAt: new Date() })
    .where(
      and(
        eq(extractions.userId, userId),
        eq(extractions.status, 'pending'),
        lt(extractions.createdAt, olderThan),
      ),
    )
    .returning({ id: extractions.id })
  return rows.map((r) => r.id)
}

/**
 * The corrections log (R-7): `{fieldPath: [{from, to, phase, checkId?, correctedAt}]}`. F05 reads
 * the current value, appends its events and writes the whole object back — this function is the
 * write, not the merge, because only F05 knows its own path syntax and phase semantics.
 */
export async function recordCorrections(
  userId: string,
  id: string,
  corrections: ExtractionCorrections,
): Promise<void> {
  const rows = await db
    .update(extractions)
    .set({ corrections })
    .where(and(eq(extractions.id, id), eq(extractions.userId, userId)))
    .returning({ id: extractions.id })
  if (rows.length === 0) throw new NotFoundError('Extraction not found')
}

export interface FieldErrorStat {
  /** The corrections key — a field name, or F05's dotted path for a nested split/zone value. */
  field: string
  /** Correction EVENTS for this field across all of this user's extractions (R-7 arrays). */
  correctionCount: number
  /** Distinct extractions in which this field was corrected at least once. */
  extractionCount: number
  /** Denominator for a per-field rate. The same value on every row, on purpose. */
  extractionsWithCorrections: number
}

/**
 * "Which field does the model get wrong most often." `jsonb_each` has no query-builder shape, so
 * this is the one raw-SQL query in the module — still user-scoped, in both the outer query and
 * the correlated subquery.
 *
 * The `jsonb_typeof` guard is not defensive noise: R-7 changed this column's shape from an object
 * to an array of events, and `jsonb_array_length` on a non-array raises rather than returning
 * null. Any row written before that ruling counts as one event instead of taking the query down.
 */
export async function getExtractionErrorProfile(userId: string): Promise<FieldErrorStat[]> {
  const result = await db.execute<{
    field: string
    correction_count: number
    extraction_count: number
    extractions_with_corrections: number
  }>(sql`
    select
      kv.key as field,
      sum(
        case when jsonb_typeof(kv.value) = 'array' then jsonb_array_length(kv.value) else 1 end
      )::int as correction_count,
      count(distinct ${extractions.id})::int as extraction_count,
      (
        select count(*)::int from ${extractions}
        where ${extractions.userId} = ${userId} and ${extractions.corrections} is not null
      ) as extractions_with_corrections
    from ${extractions}, jsonb_each(${extractions.corrections}) as kv(key, value)
    where ${extractions.userId} = ${userId}
    group by kv.key
    order by correction_count desc, kv.key asc
  `)
  return result.rows.map((row) => ({
    field: row.field,
    correctionCount: Number(row.correction_count),
    extractionCount: Number(row.extraction_count),
    extractionsWithCorrections: Number(row.extractions_with_corrections),
  }))
}

/* ============================================================================
 * §7 Photos — R-1's two-parent lifecycle
 * ==========================================================================*/

export interface NewPhotoInput {
  blobUrl: string
  pathname: string
  kind: PhotoKind
  width?: number | null
  height?: number | null
  bytes?: number | null
  sortOrder?: number
}

/**
 * Attaches uploaded screenshots to their extraction (R-1). `run_id` stays NULL until
 * `commitExtractedRun` backfills it, so a photo is never orphaned and no placeholder run is
 * needed to hold it.
 */
export async function attachExtractionPhotos(
  userId: string,
  extractionId: string,
  photos: NewPhotoInput[],
): Promise<{ ids: string[] }> {
  await assertExtractionOwned(userId, extractionId)
  if (photos.length === 0) return { ids: [] }
  const rows = photos.map((photo, i) => ({
    id: newPhotoId(),
    extractionId,
    blobUrl: photo.blobUrl,
    pathname: photo.pathname,
    kind: photo.kind,
    width: photo.width ?? null,
    height: photo.height ?? null,
    bytes: photo.bytes ?? null,
    sortOrder: photo.sortOrder ?? i,
  }))
  await db.insert(runPhotos).values(rows)
  return { ids: rows.map((r) => r.id) }
}

/** The review screen's screenshot strip, before any run exists. */
export async function listExtractionPhotos(
  userId: string,
  extractionId: string,
): Promise<RunPhoto[]> {
  return db
    .select()
    .from(runPhotos)
    .where(
      and(
        eq(runPhotos.extractionId, extractionId),
        exists(
          db
            .select({ ok: sql`1` })
            .from(extractions)
            .where(and(eq(extractions.id, extractionId), eq(extractions.userId, userId))),
        ),
      ),
    )
    .orderBy(asc(runPhotos.sortOrder), asc(runPhotos.createdAt))
}

/** R-11 / F11's per-photo opt-out. */
export async function setPhotoExcludedFromShare(
  userId: string,
  photoId: string,
  excluded: boolean,
): Promise<void> {
  const rows = await db
    .update(runPhotos)
    .set({ excludedFromShare: excluded })
    .where(and(eq(runPhotos.id, photoId), runPhotoOwnedBy(userId)))
    .returning({ id: runPhotos.id })
  if (rows.length === 0) throw new NotFoundError('Photo not found')
}

/**
 * R-15's blob rotation. A Vercel Blob URL is public and survives revocation forever, so revoking
 * a share re-uploads every photo under a fresh random pathname and points the row at it; the old
 * URL then 404s. F11 owns the fetch/upload/delete; this is the row update.
 */
export async function updatePhotoBlobLocation(
  userId: string,
  photoId: string,
  location: { blobUrl: string; pathname: string },
): Promise<void> {
  const rows = await db
    .update(runPhotos)
    .set(location)
    .where(and(eq(runPhotos.id, photoId), runPhotoOwnedBy(userId)))
    .returning({ id: runPhotos.id })
  if (rows.length === 0) throw new NotFoundError('Photo not found')
}

/** Returns the pathname so the caller can delete the blob itself — the row goes first. */
export async function deletePhoto(
  userId: string,
  photoId: string,
): Promise<{ pathname: string } | null> {
  const rows = await db
    .delete(runPhotos)
    .where(and(eq(runPhotos.id, photoId), runPhotoOwnedBy(userId)))
    .returning({ pathname: runPhotos.pathname })
  return rows[0] ?? null
}

/* ============================================================================
 * §8 Profile, insights, records, badges, shares
 * ==========================================================================*/

export async function getProfile(userId: string): Promise<Profile | null> {
  const rows = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
  return rows[0] ?? null
}

/** Upsert — no profile row exists until onboarding saves one. */
export async function upsertProfile(
  userId: string,
  patch: Partial<Omit<NewProfile, 'userId'>>,
): Promise<void> {
  await db
    .insert(profiles)
    .values({ userId, ...patch })
    .onConflictDoUpdate({ target: profiles.userId, set: { ...patch, updatedAt: new Date() } })
}

export interface NewInsightInput {
  scope: InsightScope
  scopeKey: string
  factsHash: string
  payload: unknown
  model: string
}

/**
 * The cache read. `facts_hash` is a sha256 of the metrics fed to the model, so identical facts in
 * the same scope are a hit and no LLM call happens at all.
 */
export async function getInsight(
  userId: string,
  scope: InsightScope,
  scopeKey: string,
  factsHash: string,
): Promise<Insight | null> {
  const rows = await db
    .select()
    .from(insights)
    .where(
      and(
        eq(insights.userId, userId),
        eq(insights.scope, scope),
        eq(insights.scopeKey, scopeKey),
        eq(insights.factsHash, factsHash),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

/**
 * The newest insight for a scope regardless of hash — R-19's insight memory diffs against this,
 * which is what stops week 5 reading identically to week 4. Reads `insights_latest_idx` (R-12).
 */
export async function getLatestInsight(
  userId: string,
  scope: InsightScope,
  scopeKey: string,
): Promise<Insight | null> {
  const rows = await db
    .select()
    .from(insights)
    .where(
      and(eq(insights.userId, userId), eq(insights.scope, scope), eq(insights.scopeKey, scopeKey)),
    )
    .orderBy(desc(insights.createdAt))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Insert-if-new. Two concurrent generations of the same facts (a cron refresh racing a page
 * view) must not produce two rows; the unique index decides and the loser reads the winner's row
 * rather than failing. Deliberately not an upsert: an insight is immutable once written, so
 * overwriting the payload would silently change prose a runner has already read.
 */
export async function saveInsight(
  userId: string,
  input: NewInsightInput,
): Promise<{ id: string; created: boolean }> {
  const id = newInsightId()
  const rows = await db
    .insert(insights)
    .values({ id, userId, ...input })
    .onConflictDoNothing({
      target: [insights.userId, insights.scope, insights.scopeKey, insights.factsHash],
    })
    .returning({ id: insights.id })
  const inserted = rows[0]
  if (inserted) return { id: inserted.id, created: true }
  const existing = await getInsight(userId, input.scope, input.scopeKey, input.factsHash)
  if (!existing) throw new Error('saveInsight: conflict resolved to no row')
  return { id: existing.id, created: false }
}

/**
 * Hygiene, not correctness — and the distinction matters enough to state at the definition.
 *
 * Caching is keyed on `facts_hash`, so a corrected run already misses its cached insight on the
 * next read and regenerates. What this removes is the *stale row itself*, which F08 renders
 * straight from `getLatestInsight` while the fresh one is still being written: without it, a
 * runner who corrects a split sees the old prose sitting under the new numbers for one page load.
 * Deleting is the honest state — no narrative — until the model has read the corrected facts.
 *
 * This is the one deletion in the insights table and it is deliberately narrow: a single
 * `(user, scope, scope_key)` triple, called only from `lib/derived/invalidate.ts`. `extractions`
 * is a different matter entirely and stays append-only (F03 D3).
 */
export async function deleteInsightsForScope(
  userId: string,
  scope: InsightScope,
  scopeKey: string,
): Promise<void> {
  await db
    .delete(insights)
    .where(
      and(eq(insights.userId, userId), eq(insights.scope, scope), eq(insights.scopeKey, scopeKey)),
    )
}

/**
 * **The one query in this file that is not ownership-scoped, and the second sanctioned exception
 * overall.** `/api/cron/rollup` has no session — it is authenticated by `CRON_SECRET` — and its
 * whole job is to enumerate users, so a `userId` parameter would be a lie.
 *
 * It returns ids and nothing else: no run data, no profile, no email. The cron then loops and
 * every read inside the loop is scoped to one id, so the unscoped surface is exactly this one
 * `SELECT DISTINCT` and stops there. `scripts/check-data-layer-invariants.mjs` names it in its
 * allowlist so a THIRD exception still has to be argued for in a diff.
 *
 * "Active" is deliberately generous — anyone with a reviewed run since `sinceISO`. A runner who
 * took three weeks off still wants their week to be readable when they come back.
 */
export async function listActiveUserIds(sinceISO: DateISO): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: runs.userId })
    .from(runs)
    .where(and(isNotNull(runs.reviewedAt), gte(runs.occurredOn, sinceISO)))
  return rows.map((row) => row.userId)
}

export async function getRecords(userId: string): Promise<RecordRow[]> {
  return db.select().from(records).where(eq(records.userId, userId)).orderBy(asc(records.key))
}

/**
 * D7 / R-10 — a full replace inside one `db.batch`, never per-key upserts.
 *
 * The asymmetry with badges is the point. A record is a statement about the *current* best, so a
 * correction that demotes the run holding `fastest_pace_10k` must be able to REMOVE that record;
 * an upsert has no way to express deletion and would leave a stale row pointing at a run that no
 * longer qualifies. At 17 runs a month a full recompute is free.
 */
export async function replaceRecords(
  userId: string,
  next: Omit<NewRecordRow, 'userId'>[],
): Promise<void> {
  const statements: Statement[] = [db.delete(records).where(eq(records.userId, userId))]
  if (next.length > 0) {
    statements.push(db.insert(records).values(next.map((r) => ({ ...r, userId }))))
  }
  await runBatch(statements)
}

/**
 * Every award row for a user, oldest first within each key. `foldAwards` turns them into the
 * per-key shelf entries; nothing reads a raw row and calls it "the badge".
 */
export async function getBadgeAwards(userId: string): Promise<Badge[]> {
  return db
    .select()
    .from(badges)
    .where(eq(badges.userId, userId))
    .orderBy(asc(badges.key), asc(badges.earnedOn))
}

/**
 * The awards one run earned — F11's inline "what did this run get" read.
 *
 * A real `WHERE run_id = $1` rather than the TypeScript filter this used to be. The old comment
 * argued a user has at most 22 badge rows so a second round trip was not worth it; post-F13 the
 * ledger holds one row per earn and grows without bound, so `badges_user_run_idx` is what answers
 * this instead of an array scan over the user's whole history.
 *
 * A period badge never appears here: `run_id` is null for week, month and lifetime scopes, which
 * is correct — no single run earned `century_club`.
 */
export async function getBadgeAwardsForRun(userId: string, runId: string): Promise<Badge[]> {
  return db
    .select()
    .from(badges)
    .where(and(eq(badges.userId, userId), eq(badges.runId, runId)))
    .orderBy(asc(badges.key))
}

/**
 * **One award, deduped by the primary key rather than by a read.** Returns false when the row was
 * already there.
 *
 * The opposite shape to `replaceRecords` on purpose, and no longer the same shape as it was before
 * F13. A record is a statement about the current best, so a correction must be able to REMOVE one.
 * A badge is a fact about the past, so an earn is only ever INSERTED — and whether this earn is a
 * new one is `(user_id, key, dedupe_key)`'s question to answer, not the application's. The old
 * `ON CONFLICT DO UPDATE … count + 1` had to guess, and guessed wrong every time a run other than
 * the most recent earner was re-reviewed (F12 §4.1).
 *
 * There is no update branch and no delete anywhere in this file for `badges`: §8 of F13 is explicit
 * that nothing may remove an award row.
 */
export async function insertBadgeAward(
  userId: string,
  key: string,
  award: {
    runId: string | null
    scopeKey: string | null
    dedupeKey: string
    earnedOn: DateISO
  },
): Promise<boolean> {
  const rows = await db
    .insert(badges)
    .values({ userId, key, ...award, count: 1 })
    .onConflictDoNothing()
    .returning({ key: badges.key })
  return rows.length > 0
}

export async function createShare(userId: string, runId: string): Promise<{ token: string }> {
  await assertRunOwned(userId, runId)
  const existing = await getActiveShareForRun(userId, runId)
  // The partial unique index would refuse a second active token anyway; returning the live one is
  // the useful behaviour for a "Share" button pressed twice.
  if (existing) return { token: existing.token }
  const token = newShareToken()
  await db.insert(shares).values({ token, userId, runId })
  return { token }
}

export async function getActiveShareForRun(userId: string, runId: string): Promise<Share | null> {
  const rows = await db
    .select()
    .from(shares)
    .where(and(eq(shares.runId, runId), eq(shares.userId, userId), isNull(shares.revokedAt)))
    .limit(1)
  return rows[0] ?? null
}

/** Revocation is a soft delete: the row stays, so re-sharing mints a fresh token (R-15). */
export async function revokeShare(userId: string, token: string): Promise<void> {
  const rows = await db
    .update(shares)
    .set({ revokedAt: new Date() })
    .where(and(eq(shares.token, token), eq(shares.userId, userId), isNull(shares.revokedAt)))
    .returning({ token: shares.token })
  if (rows.length === 0) throw new NotFoundError('Share not found')
}

/* ============================================================================
 * §9 The one unscoped read
 * ==========================================================================*/

/* ─────────────────────────────────────────────────────────────────────────────
 *  ⚠️  THE ONLY UNSCOPED QUERY IN THE ENTIRE APPLICATION  ⚠️
 *
 *  getRunByShareToken takes no userId, by design (roadmap D9, /s/[token]). The 96-bit token IS
 *  the credential. It returns a SharedRun — an explicit column list, never `select()` — so no
 *  `user_id`, no `note`, no extraction internals and no email can leak through a careless
 *  widening later. A revoked or unknown token returns null and the page 404s.
 *
 *  Do not add a second unscoped read anywhere in this codebase.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface SharedPhoto {
  blobUrl: string
  kind: PhotoKind
  width: number | null
  height: number | null
  sortOrder: number
}

export interface SharedRun {
  id: string
  occurredOn: DateISO
  startedAt: string | null
  activityType: string
  location: string | null
  distanceM: number
  durationSec: number
  avgPaceSec: number
  avgHr: number | null
  maxHr: number | null
  elevationM: number | null
  activeKcal: number | null
  avgCadence: number | null
  ownerName: string | null
  splits: RunSplit[]
  zones: RunZone[]
  photos: SharedPhoto[]
  /**
   * The frozen session insight (R-11): its payload carries `hrMaxUsed` / `hrMaxSource` computed
   * at generation time, so this page can render a %HRmax without ever resolving HRmax live —
   * F02's INVARIANT B satisfied structurally rather than by discipline. F11 must still strip
   * `doNext` and `questionForRunner` before rendering (R-27); they are private coaching.
   */
  insightPayload: unknown | null
}

export async function getRunByShareToken(token: string): Promise<SharedRun | null> {
  // A correlated subquery, so the child selects are filtered by the token itself rather than by
  // a run id the caller could have supplied. All five statements share one snapshot.
  const sharedRunId = db
    .select({ id: shares.runId })
    .from(shares)
    .where(and(eq(shares.token, token), isNull(shares.revokedAt)))

  const [runRows, splitRows, zoneRows, photoRows, insightRows] = await db.batch([
    db
      .select({
        id: runs.id,
        occurredOn: runs.occurredOn,
        startedAt: runs.startedAt,
        activityType: runs.activityType,
        location: runs.location,
        distanceM: runs.distanceM,
        durationSec: runs.durationSec,
        avgPaceSec: runs.avgPaceSec,
        avgHr: runs.avgHr,
        maxHr: runs.maxHr,
        elevationM: runs.elevationM,
        activeKcal: runs.activeKcal,
        avgCadence: runs.avgCadence,
        ownerName: users.name,
      })
      .from(shares)
      .innerJoin(runs, eq(runs.id, shares.runId))
      .innerJoin(users, eq(users.id, runs.userId))
      .where(and(eq(shares.token, token), isNull(shares.revokedAt)))
      .limit(1),

    db
      .select()
      .from(runSplits)
      .where(inArray(runSplits.runId, sharedRunId))
      .orderBy(asc(runSplits.km)),

    db
      .select()
      .from(runZones)
      .where(inArray(runZones.runId, sharedRunId))
      .orderBy(asc(runZones.zone)),

    db
      .select({
        blobUrl: runPhotos.blobUrl,
        kind: runPhotos.kind,
        width: runPhotos.width,
        height: runPhotos.height,
        sortOrder: runPhotos.sortOrder,
      })
      .from(runPhotos)
      .where(
        and(
          inArray(runPhotos.runId, sharedRunId),
          // R-11 — the owner's per-photo opt-out is enforced HERE, not in the page component,
          // so no future caller can render an excluded screenshot by forgetting to filter.
          eq(runPhotos.excludedFromShare, false),
        ),
      )
      .orderBy(asc(runPhotos.sortOrder), asc(runPhotos.createdAt)),

    db
      .select({ payload: insights.payload, createdAt: insights.createdAt })
      .from(insights)
      .where(and(eq(insights.scope, 'session'), inArray(insights.scopeKey, sharedRunId)))
      .orderBy(desc(insights.createdAt))
      .limit(1),
  ])

  const run = runRows[0]
  if (!run) return null
  return {
    ...run,
    splits: splitRows,
    zones: zoneRows,
    photos: photoRows,
    insightPayload: insightRows[0]?.payload ?? null,
  }
}
