import 'server-only'

import { and, asc, eq, lt } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaTurns } from '@/lib/db/schema'

import { ninaImageApology, type NinaImageFailure } from './imagefail'
import {
  jakartaDayStart,
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_DAILY_CAP,
  NINA_IMAGE_MODEL,
  NINA_IMAGE_STALE_MS,
  type NinaImageJobArgs,
  type NinaImageJobPhase,
  type NinaImagePurpose,
} from './imagerecipe'
import { countNinaTurnsSince, insertNinaMessages, insertNinaTurn } from './queries'

/**
 * **The image job's life on `nina_turns`, from the app's side.** RU-2's "queued and capped" is these
 * functions; RU-20 is why the middle of the lifecycle is missing from this file — the claim, the
 * generation and the success write all happen in `scripts/nina-image-worker.ts`.
 *
 * ── WHY `nina_turns` AND NOT A NINTH TABLE ────────────────────────────────────────────────────
 * An image generation IS a model call Nina makes, which is exactly what phase 1 says that table is
 * for ("one row per model call, written whether it succeeded or not"). It already carries
 * `kind = 'image'`, `cost_micro_usd`, `latency_ms`, `status` and `error_code`, and
 * `countNinaTurnsSince` was written for this phase's cap by name. A ninth table would duplicate six
 * columns to add nothing but a second migration.
 *
 * The one thing it did not carry was the job's arguments, and **that is what phase 1's
 * `args jsonb` column is for (RULING C1).** The first draft carried them in a fan-out request body
 * instead; RU-20 makes that impossible, because the backstop schedule wakes with no request body at
 * all, and because a `workflow_dispatch` input on a PUBLIC repo is world-readable.
 *
 * ── PHASE, NOT STATUS ─────────────────────────────────────────────────────────────────────────
 * `error_code` carries the phase while `status='pending'` (`'queued'`, `'dispatched'`, `'running'`)
 * and the failure reason when `status='failed'`. Phase 1's own comment already sanctions this use
 * ("Free text, ours not the provider's. NULL on success").
 *
 * ── WHY THE OPEN GOES THROUGH `queries.ts` AND THE REST DOES NOT ──────────────────────────────
 * `insertNinaTurn` is phase 1's, it already accepts `status: 'pending'` and `args`, and it already
 * returns the id — it was widened for this phase by name, so writing a second INSERT beside it
 * would be duplication with no argument behind it. The four remaining statements are UPDATEs and
 * SELECTs against a job lifecycle phase 1 does not model, so they live here, where deleting this
 * phase deletes them. Invariant 9 is untouched either way: it forbids Nina writing her own SQL
 * against `runs`, and there is no `runs` here.
 */

export const JOB_PHASE_QUEUED: NinaImageJobPhase = 'queued'
export const JOB_PHASE_DISPATCHED: NinaImageJobPhase = 'dispatched'
export const JOB_PHASE_RUNNING: NinaImageJobPhase = 'running'

const PENDING_PHASES: readonly string[] = [
  JOB_PHASE_QUEUED,
  JOB_PHASE_DISPATCHED,
  JOB_PHASE_RUNNING,
]

/**
 * `nina_turns.tool_calls` is `text NOT NULL DEFAULT ''` and holds tool NAMES (RULING C8), not a
 * count. An image job row IS a `generate_image` call, so it says so; the plan's `0`/`1` predate the
 * ruling. Stamped once, at open — every later write is an outcome, and re-stamping the same value
 * from the failure path (and from the worker, which cannot see this constant) would be two places
 * that have to agree about a string neither of them reads.
 */
const IMAGE_TOOL_CALL = 'generate_image'

export interface NinaImageJobRow {
  id: string
  phase: NinaImageJobPhase
  purpose: NinaImagePurpose
  attempts: number
  createdAt: Date
}

export async function ninaImageQuotaLeft(userId: string, now: Date = new Date()): Promise<number> {
  const used = await countNinaTurnsSince(userId, 'image', jakartaDayStart(now))
  return Math.max(0, NINA_IMAGE_DAILY_CAP - used)
}

/**
 * Open a job. **This is the row that makes the cap real** — it is written before any money is spent
 * and before anything is dispatched, so a burst of six requests in one second cannot all pass the
 * quota check.
 *
 * `args` carries the finished prompt and the seed, which is what lets the backstop schedule retry a
 * job nobody told it about. `model` is stamped now rather than at finish, because a row that failed
 * still says which camera it was reaching for.
 */
export async function openNinaImageJob(userId: string, args: NinaImageJobArgs): Promise<string> {
  return insertNinaTurn(userId, {
    kind: 'image',
    model: NINA_IMAGE_MODEL,
    status: 'pending',
    errorCode: JOB_PHASE_QUEUED,
    toolCalls: IMAGE_TOOL_CALL,
    args,
  })
}

/**
 * `queued` → `dispatched`, conditionally. Returns `true` exactly once per job, ever.
 *
 * It runs BEFORE the GitHub POST, not after, so two concurrent dispatch attempts for one job cannot
 * both call the API. If the POST then fails, `fireNinaImageDispatch` fails the job outright with an
 * apology (Step 5) rather than leaving a `dispatched` row that no runner will ever claim — the
 * dispatch is the one failure we learn about instantly, so it is the one we should not make the
 * runner wait 20 minutes for.
 */
export async function markNinaImageJobDispatched(userId: string, jobId: string): Promise<boolean> {
  const updated = await db
    .update(ninaTurns)
    .set({ errorCode: JOB_PHASE_DISPATCHED })
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, jobId),
        eq(ninaTurns.kind, 'image'),
        eq(ninaTurns.status, 'pending'),
        eq(ninaTurns.errorCode, JOB_PHASE_QUEUED),
      ),
    )
    .returning({ id: ninaTurns.id })
  return updated.length === 1
}

/**
 * Failure — **and the apology, in the same call.** The two cannot be separated: a caller that could
 * mark a job failed without saying anything is a caller that will eventually do so.
 *
 * The one exception is an **avatar** job, and it is structural rather than a special case: nobody
 * asked for an avatar in the chat, so there is no pending bubble to close and a chat message would
 * be Nina apologising for something the runner never requested. `postNinaApologyMessage` is skipped
 * when `purpose === 'avatar'`, and the caller (phase 13's promise evaluator, phase 15's admin
 * screen) decides whether anyone was waiting. See `avatargen.ts`.
 *
 * `costMicroUsd` is written for every kind except `stale`, because a call that reached the provider
 * and then timed out was very probably billed. Guessing high is the honest direction for a cost log;
 * `stale` means nothing ever ran, so nothing was billed.
 */
export async function failNinaImageJob(input: {
  userId: string
  jobId: string
  kind: NinaImageFailure
  purpose?: NinaImagePurpose
  latencyMs?: number | null
  replyToId?: string | null
  /** Never rendered. Log only. */
  detail?: string
}): Promise<void> {
  const { userId, jobId, kind } = input
  const purpose = input.purpose ?? 'selfie'

  console.warn('[nina] image job failed', { jobId, kind, purpose, detail: input.detail ?? null })

  if (purpose === 'selfie') {
    await postNinaApologyMessage({ userId, jobId, kind, replyToId: input.replyToId ?? null })
  }

  await db
    .update(ninaTurns)
    .set({
      status: 'failed',
      errorCode: kind,
      latencyMs: input.latencyMs ?? null,
      costMicroUsd: kind === 'stale' ? null : NINA_IMAGE_COST_MICRO_USD,
    })
    .where(and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, jobId)))
}

/**
 * **R22's whole visible surface.** One `nina_messages` row, her words, nothing else.
 *
 * There is no error code in it, no status, no provider, no "please try again", and no button. The
 * runner is told, by his friend, that there is no photo. That is the entire feature.
 */
export async function postNinaApologyMessage(input: {
  userId: string
  jobId: string
  kind: NinaImageFailure
  replyToId: string | null
}): Promise<void> {
  await insertNinaMessages(input.userId, [
    {
      role: 'nina',
      body: ninaImageApology(input.kind, input.jobId),
      source: 'chat',
      turnId: input.jobId,
      replyToId: input.replyToId,
    },
  ])
}

/**
 * **The app-side give-up, and the last line of R22.** A `pending` row older than
 * `NINA_IMAGE_STALE_MS` (20 min) is closed as `failed`/`stale` **and apologised for**.
 *
 * ── WHY IT SURVIVES ALONGSIDE THE BACKSTOP SCHEDULE ───────────────────────────────────────────
 * The workflow's `schedule:` is a RETRY engine: it finds a job whose dispatch was lost and
 * generates the photograph after all. It cannot be the deadline, because GitHub documents
 * `schedule:` as best-effort, delays it under load, and **disables it entirely on a repository with
 * no pushes for 60 days.** This function is the deadline, and it is the only mechanism in the phase
 * that still works when GitHub does not — Actions disabled, PAT revoked, an Actions incident, or the
 * repository archived.
 *
 * Its cost is two indexed statements on a page the runner is already loading, which is the answer to
 * "keep whichever is cheaper": the two sweeps are not alternatives, they buy different things at
 * different thresholds, and the cheap one is the one that carries the guarantee.
 *
 * 20 minutes is long on purpose. Apologising at 4 minutes and then delivering the photograph at 5
 * would be worse than a two-minute wait, and the typical path resolves at ~2 minutes.
 *
 * Sequential, one message per swept job, each in its own `try`: a job whose apology cannot be
 * written must not block the next job's. The set is at most a handful of rows — the cap is six a
 * day.
 */
export async function sweepStaleNinaImageJobs(
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const olderThan = new Date(now.getTime() - NINA_IMAGE_STALE_MS)

  const stale = await db
    .select({ id: ninaTurns.id, args: ninaTurns.args })
    .from(ninaTurns)
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.kind, 'image'),
        eq(ninaTurns.status, 'pending'),
        lt(ninaTurns.createdAt, olderThan),
      ),
    )

  let swept = 0
  for (const row of stale) {
    try {
      /*
       * The UPDATE's own `WHERE status='pending'` is what makes the sweep safe against a job the
       * worker finished between the SELECT above and now. `returning` length 0 means somebody else
       * closed it, and apologising for a photograph that just arrived is the one wrong thing this
       * could do.
       */
      const closed = await db
        .update(ninaTurns)
        .set({ status: 'failed', errorCode: 'stale' })
        .where(
          and(
            eq(ninaTurns.userId, userId),
            eq(ninaTurns.id, row.id),
            eq(ninaTurns.status, 'pending'),
          ),
        )
        .returning({ id: ninaTurns.id })

      if (closed.length === 0) continue

      const args = (row.args ?? null) as NinaImageJobArgs | null
      // An avatar job has no pending bubble. See `failNinaImageJob`.
      if (args?.purpose !== 'avatar') {
        await postNinaApologyMessage({
          userId,
          jobId: row.id,
          kind: 'stale',
          replyToId: args?.replyToId ?? null,
        })
      }
      swept += 1
    } catch (cause) {
      console.warn('[nina] stale image sweep failed for one job', {
        jobId: row.id,
        error: String(cause),
      })
    }
  }

  if (swept > 0) console.warn('[nina] swept stale image jobs', { userId, swept })
  return swept
}

/**
 * What is still in flight, after the sweep has had its say. `app/nina/page.tsx` awaits this for the
 * sweep's side-effect; phase 15 uses the returned rows to show what is generating.
 */
export async function listOpenNinaImageJobs(userId: string): Promise<NinaImageJobRow[]> {
  await sweepStaleNinaImageJobs(userId)

  const rows = await db
    .select({
      id: ninaTurns.id,
      phase: ninaTurns.errorCode,
      args: ninaTurns.args,
      createdAt: ninaTurns.createdAt,
    })
    .from(ninaTurns)
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.kind, 'image'),
        eq(ninaTurns.status, 'pending'),
      ),
    )
    .orderBy(asc(ninaTurns.createdAt))

  return rows.map((row) => toJobRow(row))
}

/** One job, for phase 13's and phase 15's polling. No sweep: a caller polling one job wants a fact. */
export async function getNinaImageJob(
  userId: string,
  jobId: string,
): Promise<NinaImageJobRow | null> {
  const [row] = await db
    .select({
      id: ninaTurns.id,
      phase: ninaTurns.errorCode,
      args: ninaTurns.args,
      createdAt: ninaTurns.createdAt,
    })
    .from(ninaTurns)
    .where(and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, jobId), eq(ninaTurns.kind, 'image')))
  return row == null ? null : toJobRow(row)
}

function toJobRow(row: {
  id: string
  phase: string | null
  args: unknown
  createdAt: Date
}): NinaImageJobRow {
  const args = (row.args ?? null) as NinaImageJobArgs | null
  const phase = PENDING_PHASES.includes(row.phase ?? '')
    ? (row.phase as NinaImageJobPhase)
    : JOB_PHASE_QUEUED
  return {
    id: row.id,
    phase,
    purpose: args?.purpose === 'avatar' ? 'avatar' : 'selfie',
    attempts: typeof args?.attempts === 'number' ? args.attempts : 0,
    createdAt: row.createdAt,
  }
}
