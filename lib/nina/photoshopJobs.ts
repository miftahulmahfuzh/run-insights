import 'server-only'

import { and, eq, isNull, lt, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaPhotoshopJobs } from '@/lib/db/schema'
import type { NinaPhotoshopJob, NinaPhotoshopMode, NinaPhotoshopSourceKind } from '@/lib/db/schema'
import { newId } from '@/lib/id'

import type { NinaImageFailure } from './imagefail'

/**
 * The photoshop job's lifecycle on its own table (`nina_photoshop_jobs`) —
 * `lib/nina/imagejobs.ts`'s shape, simplified: real columns instead of a jsonb `args` blob (there
 * is no cross-process worker here that needs to survive a schema it cannot see), and no revive/
 * stale-sweep nets. This is an admin-only, one-off, foreground-triggered action — if an
 * invocation dies mid-job, the admin just starts a fresh photoshop run on the same photo rather
 * than waiting on a recovery mechanism built for a chat feature with a daily quota.
 */

export const NINA_PHOTOSHOP_MAX_ATTEMPTS = 2

/** How long a `running` row is trusted before a poll gives up and calls it stuck. Matches the
 * anchored image-call ceiling with headroom — see `ninaImageCallTimeoutMs`. */
export const NINA_PHOTOSHOP_STALE_MS = 300_000

export interface NinaPhotoshopJobArgs {
  sourceKind: NinaPhotoshopSourceKind
  sourceId: string
  sourceContentHash: string | null
  mode: NinaPhotoshopMode
  model: string
  presetKey: string | null
  promptText: string
}

export async function openNinaPhotoshopJob(
  userId: string,
  args: NinaPhotoshopJobArgs,
): Promise<string> {
  const id = newId()
  await db.insert(ninaPhotoshopJobs).values({
    id,
    userId,
    sourceKind: args.sourceKind,
    sourceId: args.sourceId,
    sourceContentHash: args.sourceContentHash,
    mode: args.mode,
    model: args.model,
    presetKey: args.presetKey,
    promptText: args.promptText,
    status: 'pending',
    errorCode: 'queued',
    attempts: 0,
  })
  return id
}

interface NinaPhotoshopClaim {
  jobId: string
  args: NinaPhotoshopJobArgs
  attempts: number
}

/** The only lock: one owner-scoped conditional UPDATE, the increment in the same statement as the
 * phase flip — `claimNinaImageJob`'s own reasoning, applied to a table with no jsonb to jsonb_set. */
export async function claimNinaPhotoshopJob(
  userId: string,
  jobId: string,
): Promise<NinaPhotoshopClaim | null> {
  const claimed = await db
    .update(ninaPhotoshopJobs)
    .set({ errorCode: 'running', attempts: sql`${ninaPhotoshopJobs.attempts} + 1` })
    .where(
      and(
        eq(ninaPhotoshopJobs.userId, userId),
        eq(ninaPhotoshopJobs.id, jobId),
        eq(ninaPhotoshopJobs.status, 'pending'),
        eq(ninaPhotoshopJobs.errorCode, 'queued'),
        lt(ninaPhotoshopJobs.attempts, NINA_PHOTOSHOP_MAX_ATTEMPTS),
      ),
    )
    .returning()

  const row = claimed[0]
  if (row == null) return null

  return {
    jobId: row.id,
    attempts: row.attempts,
    args: {
      sourceKind: row.sourceKind,
      sourceId: row.sourceId,
      sourceContentHash: row.sourceContentHash,
      mode: row.mode,
      model: row.model,
      presetKey: row.presetKey,
      promptText: row.promptText,
    },
  }
}

export async function completeNinaPhotoshopJob(
  userId: string,
  jobId: string,
  result: {
    costMicroUsd: number
    resultBlobUrl: string
    resultPathname: string
    resultContentHash: string | null
    resultWidth: number
    resultHeight: number
    resultBytes: number
  },
): Promise<void> {
  await db
    .update(ninaPhotoshopJobs)
    .set({
      status: 'ok',
      errorCode: null,
      costMicroUsd: sql`coalesce(${ninaPhotoshopJobs.costMicroUsd}, 0) + ${result.costMicroUsd}`,
      resultBlobUrl: result.resultBlobUrl,
      resultPathname: result.resultPathname,
      resultContentHash: result.resultContentHash,
      resultWidth: result.resultWidth,
      resultHeight: result.resultHeight,
      resultBytes: result.resultBytes,
    })
    .where(
      and(
        eq(ninaPhotoshopJobs.userId, userId),
        eq(ninaPhotoshopJobs.id, jobId),
        eq(ninaPhotoshopJobs.status, 'pending'),
      ),
    )
}

export async function requeueNinaPhotoshopJob(
  userId: string,
  jobId: string,
  costMicroUsd: number | null,
): Promise<void> {
  await db
    .update(ninaPhotoshopJobs)
    .set({
      errorCode: 'queued',
      ...(costMicroUsd == null
        ? {}
        : {
            costMicroUsd: sql`coalesce(${ninaPhotoshopJobs.costMicroUsd}, 0) + ${costMicroUsd}`,
          }),
    })
    .where(
      and(
        eq(ninaPhotoshopJobs.userId, userId),
        eq(ninaPhotoshopJobs.id, jobId),
        eq(ninaPhotoshopJobs.status, 'pending'),
      ),
    )
}

export async function failNinaPhotoshopJob(
  userId: string,
  jobId: string,
  kind: NinaImageFailure,
  costMicroUsd: number | null,
): Promise<void> {
  await db
    .update(ninaPhotoshopJobs)
    .set({
      status: 'failed',
      errorCode: kind,
      ...(costMicroUsd == null
        ? {}
        : {
            costMicroUsd: sql`coalesce(${ninaPhotoshopJobs.costMicroUsd}, 0) + ${costMicroUsd}`,
          }),
    })
    .where(and(eq(ninaPhotoshopJobs.userId, userId), eq(ninaPhotoshopJobs.id, jobId)))
}

export async function getNinaPhotoshopJob(
  userId: string,
  jobId: string,
): Promise<NinaPhotoshopJob | null> {
  const rows = await db
    .select()
    .from(ninaPhotoshopJobs)
    .where(and(eq(ninaPhotoshopJobs.userId, userId), eq(ninaPhotoshopJobs.id, jobId)))
    .limit(1)
  return rows[0] ?? null
}

/** A `pending` row old enough that its invocation almost certainly died. Read-only — the poll
 * uses this to stop telling the admin "still working" forever; it does not retry anything. */
export function isNinaPhotoshopJobStale(job: NinaPhotoshopJob, now: Date = new Date()): boolean {
  return (
    job.status === 'pending' && now.getTime() - job.createdAt.getTime() > NINA_PHOTOSHOP_STALE_MS
  )
}

export async function resolveNinaPhotoshopJob(
  userId: string,
  jobId: string,
  action: 'replaced' | 'added' | 'discarded',
): Promise<boolean> {
  const updated = await db
    .update(ninaPhotoshopJobs)
    .set({ resolvedAction: action, resolvedAt: new Date() })
    .where(
      and(
        eq(ninaPhotoshopJobs.userId, userId),
        eq(ninaPhotoshopJobs.id, jobId),
        eq(ninaPhotoshopJobs.status, 'ok'),
        isNull(ninaPhotoshopJobs.resolvedAction),
      ),
    )
    .returning({ id: ninaPhotoshopJobs.id })
  return updated.length > 0
}
