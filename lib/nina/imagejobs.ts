import 'server-only'

import { and, asc, desc, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { ninaTurns } from '@/lib/db/schema'
import type { NinaTurnStatus } from '@/lib/db/schema'

import { ninaImageApology, type NinaImageFailure } from './imagefail'
import {
  jakartaDayStart,
  NINA_IMAGE_COST_MICRO_USD,
  NINA_IMAGE_DAILY_CAP,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_MODEL,
  NINA_IMAGE_STALE_MS,
  type NinaImageJobArgs,
  type NinaImageJobPhase,
  type NinaImagePurpose,
} from './imagerecipe'
import type { NinaJobRefusal } from './jobview'
import {
  countNinaTurnsSince,
  getNinaMessagesByIds,
  insertNinaMessages,
  insertNinaTurn,
} from './queries'
import { resolveNinaSessionForMessage } from './sessionResolve'

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
 * **R1's redo. It INSERTS; it never resets.**
 *
 * ── WHY A NEW ROW AND NOT AN UPDATE OF THE FAILED ONE (plan index *Decisions*, rung 1) ────────
 * `nina_turns` is the money ledger. Every writer in this file accumulates with
 * `coalesce(cost_micro_usd, 0) + spend` for one stated reason — *"money is never spent silently"* —
 * and a redo that flipped the failed row back to `status = 'pending'` would delete a billed
 * attempt from the audit trail: the `$0.04` it recorded, the `error_code` that says WHY it died,
 * and the `latency_ms` that says how long it took to die. The runner opens `/nina/jobs` precisely
 * to read those three numbers. So the failed row is READ and left exactly as it is, and the retry
 * is a second row that will accumulate its own spend. Two rows, two bills, two truths.
 *
 * The visible consequence is deliberate: after a redo, `/nina/jobs` shows BOTH — the old `Gagal`
 * row and a new `Antre` row above it. That is the ledger being honest, and it is also why the
 * redo control stays on the failed row afterwards.
 *
 * ── THE ARGS ARE COPIED VERBATIM (rung 6) ─────────────────────────────────────────────────────
 * Same `prompt`, same `seed`, same `replyToId`, same `scene`, same `mood`, same `sidecar`, same
 * `purpose`, same `source`. `requeueNinaImageJob` already states the rule for the retry inside a
 * job — *"the same prompt and the same seed — which is why a retry produces the same photograph
 * rather than a different one"* — and a redo is the same act performed by a human instead of by
 * the loop. Re-rolling the seed here would make the button "generate a different photo", which is
 * not what "redo" says. **`attempts: 0` is the ONE field that changes**, and it must: the row is
 * new, `claimNinaImageJob` bounds a job at `NINA_IMAGE_MAX_ATTEMPTS`, and a copied `attempts: 3`
 * would open a job that no claim predicate in this file can ever pick up.
 *
 * ── THE ORDER IS THE CAP, THEN THE INSERT (rung 6) ────────────────────────────────────────────
 * `generateNinaSelfie` states it: the cap is checked *"before the row is opened and therefore
 * before a cent is spent"*. A redo spends money exactly like a first request, and
 * `NINA_IMAGE_DAILY_CAP` is *"a money cap and not a feature cap"* — so it applies, and refusing
 * AFTER the insert would leave a `queued` row nobody will ever run. The cap read is deliberately
 * the LAST of the four refusals: the three cheap in-memory checks answer first, so a job that was
 * never redoable does not cost an extra indexed count to be told so.
 *
 * ── WHAT `no-args` ACTUALLY GUARDS ────────────────────────────────────────────────────────────
 * Not merely `args IS NULL`. `runNinaImageJob` calls `callNinaImageModel(args.prompt, args.seed)`,
 * so a row whose jsonb is present but whose `prompt` is missing or empty would open a job that
 * reaches the provider with nothing to draw, burn a generation off the daily cap and fail. The
 * three pre-`args` production rows and any future shape change land in the same refusal, which is
 * the honest one: there is nothing here to redo FROM.
 *
 * ── OWNERSHIP (plan invariant 3) ──────────────────────────────────────────────────────────────
 * `eq(ninaTurns.userId, userId)` is in the `WHERE` of the read, beside `eq(ninaTurns.id, jobId)`
 * and `eq(ninaTurns.kind, 'image')`. Another runner's job and a job that never existed both come
 * back `not-found`, identically. `kind = 'image'` is load-bearing for the reason the block above
 * `listNinaImageJobs` gives at length: since phase 3 this table also holds `kind = 'chat'` rows
 * sitting in `status = 'pending'` with a completely different `args` shape.
 *
 * It returns a discriminated union rather than throwing, because the caller is a Server Action
 * whose job is to hand a refusal code back to a button — `generateNinaSelfie`'s `NinaSelfieResult`
 * is the same shape for the same reason.
 */
export type NinaImageReopen =
  | {
      ok: true
      /** The NEW row. The failed one keeps its own id and its own numbers. */
      jobId: string
      purpose: NinaImagePurpose
      /** Copied verbatim. May name a message that no longer exists — see `finishSelfie`. */
      replyToId: string | null
    }
  | { ok: false; reason: NinaJobRefusal }

/**
 * Is there enough in this jsonb to run a generation from?
 *
 * A type predicate rather than a boolean so the caller's spread is typed without a cast. It checks
 * the two fields `runNinaImageJob` dereferences and nothing else: `scene`, `mood` and `sidecar` are
 * copied through whatever they are, because a missing caption is a worse photograph and a missing
 * prompt is no photograph at all.
 */
function isRedoableArgs(value: unknown): value is NinaImageJobArgs {
  if (value == null || typeof value !== 'object') return false
  const args = value as Partial<NinaImageJobArgs>
  return typeof args.prompt === 'string' && args.prompt !== '' && typeof args.seed === 'number'
}

export async function reopenNinaImageJob(userId: string, jobId: string): Promise<NinaImageReopen> {
  const [row] = await db
    .select({ status: ninaTurns.status, args: ninaTurns.args })
    .from(ninaTurns)
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, jobId),
        eq(ninaTurns.kind, 'image'),
        // R2: a redo is a START, and a job he hid must not be redoable from a stale tab. The empty
        // read makes this `'not-found'` for free — no new member of `NinaJobRefusal`.
        isNull(ninaTurns.deletedAt),
      ),
    )

  if (row == null) return { ok: false, reason: 'not-found' }

  /* `jobCanRedo` decides whether the BUTTON is drawn. This decides whether the JOB is opened, and
   * it asks the database rather than the browser. Same rule, two enforcement points, and the
   * second one is the only one that counts. */
  if (row.status !== 'failed') return { ok: false, reason: 'not-failed' }

  const args = row.args
  if (!isRedoableArgs(args)) return { ok: false, reason: 'no-args' }

  if ((await ninaImageQuotaLeft(userId)) <= 0) return { ok: false, reason: 'capped' }

  /* Verbatim, with the one field that must not be. See the header. */
  const reopenedId = await openNinaImageJob(userId, { ...args, attempts: 0 })

  return {
    ok: true,
    jobId: reopenedId,
    /* `toJobRecord`'s normalisation, kept identical so the two projections cannot disagree about a
     * purpose — the value below is what `fireNinaImageGeneration` logs and what decides whether
     * `failNinaImageJob` writes an apology. */
    purpose: args.purpose === 'avatar' ? 'avatar' : 'selfie',
    replyToId: typeof args.replyToId === 'string' ? args.replyToId : null,
  }
}

export interface NinaImageClaim {
  jobId: string
  args: NinaImageJobArgs
  /** After the increment. 1 on a first claim. */
  attempts: number
}

/**
 * **The only lock in the system, now on our side of the wire.** One owner-scoped conditional
 * UPDATE; exactly one caller gets a row back.
 *
 * This replaces `markNinaImageJobDispatched`, and **replacing it is how analysis Finding 2 dies at
 * the source.** That function stamped `error_code = 'dispatched'` and then POSTed to GitHub, while
 * `scripts/nina-image-worker.ts`'s `claimJob` would only claim a `dispatched` row older than
 * `NINA_IMAGE_DISPATCH_GRACE_MS` (60 s) — and a runner takes 25-40 s to boot. Measured: job
 * `ke20AUHNE0TB` was created at 03:02:31.897Z and the runner ran at 03:03:00.4Z, 28.5 s old, and
 * was excluded by the `WHERE` clause of the very statement dispatched to claim it. Fifteen of
 * eighteen jobs ever opened sit at `attempts = 0`. **The doorbell rang a runner that was
 * structurally forbidden from opening the door.** In-platform there is no doorbell, no grace
 * window and no second process: the claim and the generation are the same invocation, so the
 * phase the row is in when the generator looks at it is a phase the generator itself wrote.
 *
 * ── THE TWO CUTOFFS, AND WHY THEY ARE PARAMETERS ──────────────────────────────────────────────
 * The ordinary path (`fireNinaImageGeneration`, milliseconds after `openNinaImageJob`) passes
 * neither and claims a `queued` row at any age. The RECOVERY path (`reviveNinaImageJobs`, on a
 * `/nina` render) passes both, because it is doing exactly what the grace window was invented to
 * prevent — stealing a job another host might still be about to start:
 *
 *   · `queuedBefore`  — a `queued` (or legacy `dispatched`) row older than this was never picked
 *                       up by whoever opened it. `NINA_IMAGE_DISPATCH_GRACE_MS` is the caller's
 *                       value, and that constant's ONE surviving honest meaning.
 *   · `runningBefore` — a `running` row older than this cannot still be running on either host:
 *                       `NINA_IMAGE_RECLAIM_MS` (7 min) exceeds both the Vercel ceiling (300 s)
 *                       and the workflow's `timeout-minutes` (6 min).
 *
 * ── `created_at` IS A PROXY FOR A CLAIM TIME, AND `attempts` IS WHAT MAKES IT SAFE ─────────────
 * `nina_turns` has no `claimed_at` column and this phase adds none — **and no other phase adds one
 * either: this plan set generates NO migration at all** (phase 6 declines an FK with a three-part
 * argument, phase 3 accepts its own race rather than indexing it, and `npm run db:check` must stay
 * clean in every phase). So a SECOND claim compares against a timestamp that
 * is already old, which would make a reclaimed job immediately eligible again — and the only thing
 * stopping an infinite reclaim loop is `attempts < NINA_IMAGE_MAX_ATTEMPTS` in the same clause.
 * **That bound is load-bearing, not a nicety.** `scripts/nina-image-worker.ts`'s `claimJob` says
 * the same thing about the same column, deliberately: two hosts, one rule.
 *
 * `error_code = 'dispatched'` is admitted for LEGACY rows only. Nothing writes it after this
 * phase; the fifteen orphans already in the database do carry it, and a claim predicate that
 * excluded them would strand exactly the rows this phase exists to unstick.
 */
export async function claimNinaImageJob(
  userId: string,
  jobId: string,
  opts: { queuedBefore?: Date | null; runningBefore?: Date | null } = {},
): Promise<NinaImageClaim | null> {
  const queuedBefore = opts.queuedBefore ?? null
  const runningBefore = opts.runningBefore ?? null

  const notStarted = or(
    eq(ninaTurns.errorCode, JOB_PHASE_QUEUED),
    eq(ninaTurns.errorCode, JOB_PHASE_DISPATCHED),
  )

  const phasePredicate =
    runningBefore === null
      ? queuedBefore === null
        ? notStarted
        : and(notStarted, lt(ninaTurns.createdAt, queuedBefore))
      : or(
          queuedBefore === null
            ? notStarted
            : and(notStarted, lt(ninaTurns.createdAt, queuedBefore)),
          and(eq(ninaTurns.errorCode, JOB_PHASE_RUNNING), lt(ninaTurns.createdAt, runningBefore)),
        )

  const claimed = await db
    .update(ninaTurns)
    .set({
      errorCode: JOB_PHASE_RUNNING,
      /*
       * The increment is in the SAME statement as the phase change, so two concurrent claimants
       * cannot both spend the retry budget. `coalesce` covers a row whose `args` predate the
       * field; `jsonb_set` on a NULL `args` would return NULL and silently erase the prompt, which
       * is why `args IS NOT NULL` is also in the WHERE.
       */
      args: sql`jsonb_set(
        ${ninaTurns.args},
        '{attempts}',
        to_jsonb(coalesce((${ninaTurns.args} ->> 'attempts')::int, 0) + 1)
      )`,
    })
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, jobId),
        eq(ninaTurns.kind, 'image'),
        eq(ninaTurns.status, 'pending'),
        // R2: a claim is a START, and the flag's rule is that nothing new starts for a hidden job.
        isNull(ninaTurns.deletedAt),
        isNotNull(ninaTurns.args),
        sql`coalesce((${ninaTurns.args} ->> 'attempts')::int, 0) < ${NINA_IMAGE_MAX_ATTEMPTS}`,
        phasePredicate,
      ),
    )
    .returning({ id: ninaTurns.id, args: ninaTurns.args })

  const row = claimed[0]
  if (row == null) return null

  const args = row.args as NinaImageJobArgs
  return {
    jobId: row.id,
    args,
    attempts: typeof args.attempts === 'number' ? args.attempts : 1,
  }
}

/**
 * The job is done and the photograph is visible. Owner-scoped, and `status='pending'` guarded so
 * it cannot resurrect a row a sweep already closed.
 *
 * **`cost_micro_usd` ACCUMULATES. It is a per-JOB total, not a per-attempt spend.** RECONCILED —
 * see the plan index's *Decisions*, rung 1: invariant 9. A job that failed its first attempt (which
 * `requeueNinaImageJob` below recorded) and succeeded on its second reached OpenRouter twice and
 * was billed twice; a plain `SET` here would overwrite the first bill and record one generation
 * where two happened, which is money spent silently. `scripts/nina-image-worker.ts`'s
 * `finishSelfie`/`finishAvatar` do the same after phase 1 — **two hosts, one meaning for one
 * column**, which is the whole point of fixing it in both places rather than one.
 */
export async function completeNinaImageJob(
  userId: string,
  jobId: string,
  result: { latencyMs: number; costMicroUsd: number },
): Promise<void> {
  await db
    .update(ninaTurns)
    .set({
      status: 'ok',
      errorCode: null,
      latencyMs: result.latencyMs,
      /* `coalesce(cost_micro_usd, 0)` on the right-hand side of a SET is the OLD row value —
       * standard Postgres, and what makes the accumulation correct. */
      costMicroUsd: sql`coalesce(${ninaTurns.costMicroUsd}, 0) + ${result.costMicroUsd}`,
    })
    .where(
      and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, jobId), eq(ninaTurns.status, 'pending')),
    )
}

/**
 * A failed attempt with retry budget left. Back to `queued`, still `pending`, **same prompt and
 * same seed** — which is why both are stored in `args` rather than rebuilt, and why a retry
 * produces the same photograph rather than a different one. Nothing is said to the runner: her
 * bubble still says she is taking the photo, and she is.
 *
 * **IT RECORDS THE SPEND, and an earlier draft of this phase did not.** A retry branch that wrote
 * only `latencyMs` loses a whole generation from the ledger: the attempt reached the provider, was
 * billed, and the row said nothing. That is invariant 9's exact failure, one host over from where
 * the analysis measured it. `costMicroUsd` is what THIS attempt is KNOWN to have spent; `null`
 * means the call returned no figure and **adds nothing**, deliberately — an unknown guessed twice
 * for one picture is a worse log than a missing one, and the terminal branch is where guessing
 * high belongs. `scripts/nina-image-worker.ts`'s `closeFailed` retry branch is the same rule.
 */
export async function requeueNinaImageJob(
  userId: string,
  jobId: string,
  result: { latencyMs: number; costMicroUsd: number | null },
): Promise<void> {
  await db
    .update(ninaTurns)
    .set({
      errorCode: JOB_PHASE_QUEUED,
      latencyMs: result.latencyMs,
      costMicroUsd: sql`coalesce(${ninaTurns.costMicroUsd}, 0) + ${result.costMicroUsd ?? 0}`,
    })
    .where(
      and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, jobId), eq(ninaTurns.status, 'pending')),
    )
}

export interface NinaImageRevivable {
  id: string
  purpose: NinaImagePurpose
  replyToId: string | null
}

/**
 * **R7's recovery read.** Jobs that are still `pending` but that nothing can plausibly be working
 * on: a `queued`/`dispatched` row nobody started, or a `running` row whose invocation cannot still
 * be alive. `lib/nina/imagerun.ts`'s `reviveNinaImageJobs` re-fires them in-platform.
 *
 * **This is a WRITE-PATH read and it is deliberately not `listOpenNinaImageJobs`.** That function
 * sweeps, projects for the screen and is phase 4's to widen; this one answers one question with
 * three columns and no side effect. Phase 4 may fold it into its widened projection — but it must
 * then keep the two cutoffs, which are the whole content of the question.
 *
 * Ordered oldest-first: the job that has been waiting longest is the one the runner is wondering
 * about.
 */
export async function listRevivableNinaImageJobs(
  userId: string,
  cutoffs: { queuedBefore: Date; runningBefore: Date },
): Promise<NinaImageRevivable[]> {
  const rows = await db
    .select({ id: ninaTurns.id, phase: ninaTurns.errorCode, args: ninaTurns.args })
    .from(ninaTurns)
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.kind, 'image'),
        eq(ninaTurns.status, 'pending'),
        // R2: never revive a job he hid — reviving is exactly "start something new for it".
        isNull(ninaTurns.deletedAt),
        isNotNull(ninaTurns.args),
        sql`coalesce((${ninaTurns.args} ->> 'attempts')::int, 0) < ${NINA_IMAGE_MAX_ATTEMPTS}`,
        or(
          and(
            or(
              eq(ninaTurns.errorCode, JOB_PHASE_QUEUED),
              eq(ninaTurns.errorCode, JOB_PHASE_DISPATCHED),
            ),
            lt(ninaTurns.createdAt, cutoffs.queuedBefore),
          ),
          and(
            eq(ninaTurns.errorCode, JOB_PHASE_RUNNING),
            lt(ninaTurns.createdAt, cutoffs.runningBefore),
          ),
        ),
      ),
    )
    .orderBy(asc(ninaTurns.createdAt))

  return rows.map((row) => {
    const args = (row.args ?? null) as NinaImageJobArgs | null
    return {
      id: row.id,
      purpose: args?.purpose === 'avatar' ? 'avatar' : 'selfie',
      replyToId: args?.replyToId ?? null,
    }
  })
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
 */
export async function failNinaImageJob(input: {
  userId: string
  jobId: string
  kind: NinaImageFailure
  purpose?: NinaImagePurpose
  latencyMs?: number | null
  /**
   * What was actually billed, in micro-USD, when the caller knows. `undefined` keeps the shipped
   * behaviour exactly: `null` for `stale` (nothing ever ran, so nothing was billed) and
   * `NINA_IMAGE_COST_MICRO_USD` for everything else (a call that reached the provider and then
   * timed out was very probably billed, and guessing high is the honest direction for a cost log).
   * `lib/nina/imagerun.ts` passes `0` when the request was never sent.
   */
  costMicroUsd?: number | null
  replyToId?: string | null
  /** Never rendered. Log only. */
  detail?: string
}): Promise<void> {
  /*
   * ── THE COLUMN IS A PER-JOB TOTAL, SO THIS ACCUMULATES AND NEVER OVERWRITES ────────────────
   * RECONCILED — plan index *Decisions*, rung 1 (invariant 9). Three cases, and the third is the
   * one a plain `SET` would get catastrophically wrong:
   *
   *   · a NUMBER      -> `coalesce(cost_micro_usd, 0) + n`. What the caller measured, added on.
   *   · `undefined`, kind != 'stale' -> add `NINA_IMAGE_COST_MICRO_USD`. A call that reached the
   *     provider and then timed out was very probably billed; guessing high is the honest
   *     direction for a cost log. This is the shipped behaviour, made additive.
   *   · `undefined`, kind == 'stale' -> **LEAVE THE COLUMN ENTIRELY ALONE.** The shipped code
   *     wrote `null` here, on the true premise that nothing ever ran. That premise stops holding
   *     the moment a job can be RETRIED: a job that burned attempt 1 (billed, $0.04 recorded by
   *     `requeueNinaImageJob`) and then went stale would have that $0.04 overwritten with NULL by
   *     the sweep — the ledger erasing money on the one path whose whole job is to notice that a
   *     job died. So `stale` omits the field from the SET rather than writing anything. A job
   *     that genuinely never ran still reads NULL, because nothing ever added to it.
   */
  const { userId, jobId, kind } = input
  const purpose = input.purpose ?? 'selfie'

  console.warn('[nina] image job failed', { jobId, kind, purpose, detail: input.detail ?? null })

  /*
   * ── THE APOLOGY MAY NOT SWALLOW THE LEDGER (PLAN INVARIANT 9) ─────────────────────────────
   * This used to be an unguarded `await` before the UPDATE, which is the app-side twin of the bug
   * the analysis measured in `scripts/nina-image-worker.ts`: `closeFailed` threw on its
   * `nina_messages` INSERT and took the process down BEFORE `update nina_turns … set
   * status='failed'` ever ran, so the job stayed `pending`, a later sweep marked it `stale` with
   * `cost_micro_usd: null`, and $0.04 was recorded as free. Money spent must be written down even
   * when her sentence cannot be. The apology is worth a lot; the ledger is not optional.
   *
   * The one exception is structural rather than a special case: an AVATAR job has no pending
   * bubble, because nobody asked for it in the chat, so a message would be Nina apologising for
   * something the runner never requested. See `avatargen.ts`.
   */
  if (purpose === 'selfie') {
    try {
      await postNinaApologyMessage({ userId, jobId, kind, replyToId: input.replyToId ?? null })
    } catch (cause) {
      console.error('[nina] image apology could not be written; closing the job anyway', {
        jobId,
        error: String(cause),
      })
    }
  }

  /* The added amount, or `null` meaning "do not touch the column at all". See the block above. */
  const addend: number | null =
    input.costMicroUsd !== undefined
      ? (input.costMicroUsd ?? NINA_IMAGE_COST_MICRO_USD)
      : kind === 'stale'
        ? null
        : NINA_IMAGE_COST_MICRO_USD

  await db
    .update(ninaTurns)
    .set({
      status: 'failed',
      errorCode: kind,
      latencyMs: input.latencyMs ?? null,
      /* Spread rather than a ternary INSIDE the object: writing `costMicroUsd: undefined` is not
       * the same as omitting the key in drizzle, and "leave it alone" has to mean no assignment. */
      ...(addend === null
        ? {}
        : { costMicroUsd: sql`coalesce(${ninaTurns.costMicroUsd}, 0) + ${addend}` }),
    })
    .where(and(eq(ninaTurns.userId, userId), eq(ninaTurns.id, jobId)))
}

/**
 * **R22's whole visible surface.** One `nina_messages` row, her words, nothing else.
 *
 * There is no error code in it, no status, no provider, no "please try again", and no button. The
 * runner is told, by his friend, that there is no photo. That is the entire feature.
 *
 * ── WHICH CONVERSATION IT LANDS IN (F35 PHASE 3, R2) ─────────────────────────────────────────
 * The one he asked in. `replyToId` is already *"the runner message that asked, so the photo or the
 * apology quotes it"* (`NinaImageJobArgs`), and that row carries a `session_id` — so
 * `resolveNinaSessionForMessage` reads the answer off the message rather than guessing at it. This
 * is strictly better than assumption A3's "the most recent session", which for a job opened twenty
 * minutes ago may no longer be the same chat: an apology arriving in a conversation he was not
 * having is worse than no apology, because it is Nina appearing to answer something he never said.
 *
 * A3 is still the fallback and covers the two honest misses — an avatar job, which has no runner
 * message at all (`failNinaImageJob` skips the apology for those, but the sweep's `args` may be
 * null), and a message deleted since the job opened, which phase 7 makes reachable.
 *
 * The resolution is one indexed read on a path that is already writing a row, and it runs at most
 * six times a day (the generation cap), so its cost is not worth optimising away by threading a
 * session through `NinaImageJobArgs` — which would also mean a schema-shaped decision about rows
 * already in flight, and `jsonb` args written before this phase carry no session at all.
 */
export async function postNinaApologyMessage(input: {
  userId: string
  jobId: string
  kind: NinaImageFailure
  replyToId: string | null
}): Promise<void> {
  const sessionId = await resolveNinaSessionForMessage(input.userId, input.replyToId)

  await insertNinaMessages(
    input.userId,
    [
      {
        role: 'nina',
        body: ninaImageApology(input.kind, input.jobId),
        source: 'chat',
        turnId: input.jobId,
        replyToId: input.replyToId,
      },
    ],
    sessionId,
  )
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
        /* R2: never APOLOGISE in the chat for a job he hid. The sweep's whole visible output is
         * `postNinaApologyMessage`, and a sentence from Nina about a row that is no longer on any
         * screen is the one thing tidying the list must not produce. */
        isNull(ninaTurns.deletedAt),
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
            /* R2, and the same race the `status` guard above covers: he may have hidden the row
             * between the SELECT and this statement. `returning` length 0 then means "somebody
             * else closed it OR he hid it", and both want the same answer — skip, apologise for
             * nothing. */
            isNull(ninaTurns.deletedAt),
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
        // R2: `/nina`'s in-flight strip is a LIST, so a hidden job leaves it. The generation it
        // describes keeps running; only the row is gone.
        isNull(ninaTurns.deletedAt),
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
    // R2: a poll on a hidden job answers "no such job" — which is what a poller should do with a
    // row that has left every screen it could report into.
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, jobId),
        eq(ninaTurns.kind, 'image'),
        isNull(ninaTurns.deletedAt),
      ),
    )
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

/*
 * ── R1's READS. WHY THEY ARE NOT `listOpenNinaImageJobs` WIDENED ──────────────────────────────
 *
 * `listOpenNinaImageJobs` is two things at once, and both of them are wrong for a tracking page.
 * It returns only `status = 'pending'` rows, and R1 wants EVERY job — a runner opening this screen
 * is usually asking why a photo never arrived, which is a question only the closed rows answer.
 * And it SWEEPS first, deliberately, because `app/nina/page.tsx` awaits it for that side effect and
 * that sweep is R22's last guarantee.
 *
 * A list read that silently marks jobs failed and writes apology messages into a conversation is a
 * surprise, and a tracking screen is the last place to spring one: the runner would be looking at a
 * page that CHANGED WHAT IT WAS DESCRIBING by being looked at. So the sweep stays exactly where it
 * is, on `/nina`, and these two reads write nothing.
 *
 * The visible consequence is deliberate and honest: a job stuck `pending` for three hours shows as
 * `pending` with a three-hour clock here, rather than being retro-labelled `stale` by the act of
 * opening the page. That is the symptom findings 2 and 3 actually produce, and hiding it behind a
 * sweep would hide the bug this whole plan set exists to fix.
 *
 * **`kind = 'image'` IS LOAD-BEARING IN BOTH `WHERE`s, AND IT IS NEWLY SO.** Since phase 3,
 * `nina_turns` also carries `kind = 'chat'` rows sitting in `status = 'pending'` with a completely
 * different `args` shape (`{ sessionId, runnerMessageId, depth }`) — and `closeNinaChatTurn` can
 * write `error_code = 'session-gone'` on one of them. Dropping the filter would not error; it would
 * list every backgrounded chat turn on this screen as though it were a photograph, with a null
 * purpose falling through to `'selfie'`. Every image reader in this file filters on it for that
 * reason.
 */

/**
 * How many jobs the list renders. Six a day is `NINA_IMAGE_DAILY_CAP`, so sixty is ten days of
 * flat-out use — `NINA_ALBUM_MAX`'s reasoning, one table over. A real `LIMIT`, not a `slice`: this
 * table grows forever and a tracking page has no business reading all of it.
 */
export const NINA_JOB_LIST_LIMIT = 60

/**
 * One image job, as R1's screens need it — strictly wider than `NinaImageJobRow`.
 *
 * `errorCode` keeps the column's own dual meaning (the PHASE while `status='pending'`, the FAILURE
 * REASON when `status='failed'`) rather than being split into two fields here. `lib/nina/jobview.ts`
 * is where that ambiguity is resolved, once, by `jobStage` — resolving it in the read as well would
 * be two places that have to agree about a rule neither of them owns.
 *
 * Every `args`-derived field is NULLABLE even where `NinaImageJobArgs` declares it required: three
 * `kind='image'` rows in production predate that shape and carry `args = null`, and phase 2 may
 * widen the shape again. A projection that assumed the args are there would be a projection that
 * throws on the oldest rows in the table — which are exactly the rows a tracking page is for.
 */
export interface NinaImageJobRecord {
  id: string
  status: NinaTurnStatus
  /** Phase while pending, failure reason when failed, `null` on success. */
  errorCode: string | null
  model: string
  createdAt: Date
  latencyMs: number | null
  /**
   * **A per-JOB CUMULATIVE TOTAL, not a per-attempt spend.** Reconciled across phases 1, 2, 4 and 7
   * under invariant 9 ("money is never spent silently"): every writer on both hosts accumulates
   * with `coalesce(cost_micro_usd, 0) + spend`, so a job that burned two attempts reads the sum of
   * both bills. `NinaJobDetail` labels it "Biaya total" for exactly this reason. `null` means
   * nothing was ever recorded — which is "we do not know", never "it was free".
   */
  costMicroUsd: number | null
  purpose: NinaImagePurpose
  scene: string | null
  mood: string | null
  /** **The exact prompt as sent.** R1 asks for this by name. */
  prompt: string | null
  /** The prompt-as-sent record that lands in `nina_message_images.prompt`. */
  sidecar: string | null
  seed: number | null
  attempts: number
  source: NinaImageJobArgs['source'] | null
  /** The runner message that asked, per `NinaImageJobArgs`. `null` for every avatar job. */
  replyToId: string | null
}

export interface NinaImageJobDetail extends NinaImageJobRecord {
  /**
   * The session `replyToId` lives in — **resolved, not assumed.**
   *
   * `null` means one of two things and they need the same answer: the message was deleted
   * (`reply_to_id` is `ON DELETE SET NULL`, so the jsonb keeps pointing at nothing) or its session
   * was removed and the cascade took it. `planJobJump` turns both into `{ kind: 'gone' }`, and its
   * docstring records why they must not be split into two sentences.
   */
  replySessionId: string | null
}

const JOB_COLUMNS = {
  id: ninaTurns.id,
  status: ninaTurns.status,
  errorCode: ninaTurns.errorCode,
  model: ninaTurns.model,
  createdAt: ninaTurns.createdAt,
  latencyMs: ninaTurns.latencyMs,
  costMicroUsd: ninaTurns.costMicroUsd,
  args: ninaTurns.args,
}

function toJobRecord(row: {
  id: string
  status: NinaTurnStatus
  errorCode: string | null
  model: string
  createdAt: Date
  latencyMs: number | null
  costMicroUsd: number | null
  args: unknown
}): NinaImageJobRecord {
  const args = (row.args ?? null) as Partial<NinaImageJobArgs> | null
  return {
    id: row.id,
    status: row.status,
    errorCode: row.errorCode,
    model: row.model,
    createdAt: row.createdAt,
    latencyMs: row.latencyMs,
    costMicroUsd: row.costMicroUsd,
    /* `toJobRow`'s rule, kept verbatim so the two projections cannot disagree about a purpose. */
    purpose: args?.purpose === 'avatar' ? 'avatar' : 'selfie',
    scene: typeof args?.scene === 'string' ? args.scene : null,
    mood: typeof args?.mood === 'string' ? args.mood : null,
    prompt: typeof args?.prompt === 'string' ? args.prompt : null,
    sidecar: typeof args?.sidecar === 'string' ? args.sidecar : null,
    seed: typeof args?.seed === 'number' ? args.seed : null,
    attempts: typeof args?.attempts === 'number' ? args.attempts : 0,
    source:
      args?.source === 'chat' || args?.source === 'generated' || args?.source === 'admin'
        ? args.source
        : null,
    replyToId: typeof args?.replyToId === 'string' ? args.replyToId : null,
  }
}

/**
 * **R1's list. Every image job, newest first, and NOTHING is written.** See the block above.
 *
 * One indexed read on `nina_turns_user_created_idx` (`(user_id, created_at DESC)`), with `kind`
 * as a heap filter over rows that are already this user's — the same access path
 * `countNinaTurnsSince` uses for the daily cap.
 */
export async function listNinaImageJobs(
  userId: string,
  opts: { limit?: number } = {},
): Promise<NinaImageJobRecord[]> {
  const rows = await db
    .select(JOB_COLUMNS)
    .from(ninaTurns)
    /* R2, and this is the read the feature is FOR. It also serves `/nina/about`'s "Pembuatan
     * foto" section, so a job hidden on one surface is hidden on both — which is correct: he
     * hid the JOB, not the row on one screen. `/nina/about`'s markup and controls are untouched;
     * only its contents shrink. */
    .where(
      and(eq(ninaTurns.userId, userId), eq(ninaTurns.kind, 'image'), isNull(ninaTurns.deletedAt)),
    )
    .orderBy(desc(ninaTurns.createdAt))
    .limit(opts.limit ?? NINA_JOB_LIST_LIMIT)

  return rows.map((row) => toJobRecord(row))
}

/**
 * **R1's detail read, and invariant 5 in one function.**
 *
 * A job id in a URL is a CLAIM. `eq(ninaTurns.userId, userId)` in the `WHERE` is what turns it into
 * a fact: somebody else's id and an id that never existed both come back `null`, so the page 404s
 * identically for both and nothing leaks which ids exist. The route still shape-checks with
 * `isValidId` first, on `/r/[id]`'s precedent — a segment that cannot be one of ours should 404
 * without a query.
 *
 * The second read resolves the triggering message. `getNinaMessagesByIds` is owner-scoped too, so
 * a `replyToId` belonging to another runner — or to a message that has since been deleted, or whose
 * session was removed — comes back empty and `replySessionId` stays `null`. That is deliberately
 * the SAME mechanism `resolveNinaSessionForMessage` uses to place an apology, so the two features
 * cannot disagree about which conversation a job belongs to.
 *
 * It is a second round trip rather than a join, for the reason `postNinaApologyMessage` gives about
 * the same lookup: it is one indexed read, on a page that is already one indexed read, opened at
 * most a handful of times a day. A hand-written join against a `jsonb` field would buy a
 * millisecond and cost the ownership scope being visible in one place.
 */
export async function getNinaImageJobDetail(
  userId: string,
  jobId: string,
): Promise<NinaImageJobDetail | null> {
  const [row] = await db
    .select(JOB_COLUMNS)
    .from(ninaTurns)
    /* R2: a hidden job 404s at `/nina/jobs/[id]`. `null` here already means "not yours OR never
     * existed", stated in this function's own header as an anti-oracle property; "hidden" joins
     * that set rather than getting a third, distinguishable answer. */
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, jobId),
        eq(ninaTurns.kind, 'image'),
        isNull(ninaTurns.deletedAt),
      ),
    )

  if (row == null) return null

  const record = toJobRecord(row)
  if (record.replyToId === null) return { ...record, replySessionId: null }

  const [message] = await getNinaMessagesByIds(userId, [record.replyToId])
  return { ...record, replySessionId: message?.sessionId ?? null }
}

/**
 * **R2's only write, and it is a flag.** The runner tapped the trash icon on `/nina/jobs`; this
 * stamps `deleted_at` and returns whether a row was actually flagged.
 *
 * ── WHY IT IS AN UPDATE AND NOT A DELETE, ONE MORE TIME ───────────────────────────────────────
 * His words: *"delete job icon … (but just soft delete in neon db)"*. `nina_turns` is the money
 * ledger and the audit trail at once, and this row carries a `cost_micro_usd` that was really
 * billed. Nothing in the SET touches `status`, `error_code`, `cost_micro_usd` or `latency_ms` —
 * tidying a list may not rewrite what a generation cost or how it ended.
 *
 * ── OWNERSHIP IS PROVED IN SQL, AND SO IS IDEMPOTENCE ─────────────────────────────────────────
 * Invariant 3: `userId` is first and it is in the `WHERE`, so a job id from a browser is a claim
 * that this statement turns into a fact. `kind = 'image'` is load-bearing for the reason the
 * block above `listNinaImageJobs` gives — since phase 3 this table also holds pending `kind='chat'`
 * turns, and this column has no meaning on one. `isNull(deletedAt)` makes a second tap a no-op
 * rather than a re-stamp, so a double-tap cannot move the timestamp and `false` means exactly one
 * thing to the caller: **nothing changed.** Not his, never existed, not an image row, or already
 * hidden — four causes, one answer, deliberately, so the return value cannot be used to probe
 * which job ids exist.
 *
 * `now()` and not `new Date()`: the database's clock, so `deleted_at` can never precede the
 * `created_at` it sits beside because a serverless host's clock drifted. Same instinct as
 * `created_at`'s `defaultNow()`.
 *
 * **This does not cancel anything.** A `pending` job that is already claimed keeps drawing and its
 * photograph still arrives in the chat. See `nina_turns.deleted_at`'s docstring, point 2.
 */
export async function softDeleteNinaImageJob(userId: string, jobId: string): Promise<boolean> {
  const flagged = await db
    .update(ninaTurns)
    .set({ deletedAt: sql`now()` })
    .where(
      and(
        eq(ninaTurns.userId, userId),
        eq(ninaTurns.id, jobId),
        eq(ninaTurns.kind, 'image'),
        isNull(ninaTurns.deletedAt),
      ),
    )
    .returning({ id: ninaTurns.id })

  return flagged.length > 0
}
