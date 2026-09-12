/**
 * Claiming: the one lock in the system. A single conditional UPDATE turns a `queued`, stale-
 * `dispatched` or stale-`running` row into this runner's job, and spends the attempts budget in
 * the same statement — exactly one caller gets a row back.
 *
 * Part of the `nina-image-worker/` split; the system-level doc — why this worker exists, why it is
 * `.ts`, what it cannot import, where it runs — lives in the barrel `../nina-image-worker.ts`. The
 * worker's import rules: `.ts`-suffixed relative imports only, no `@/` aliases, no `server-only`,
 * CJS packages through `createRequire`.
 */
import {
  NINA_IMAGE_DISPATCH_GRACE_MS,
  NINA_IMAGE_MAX_ATTEMPTS,
  NINA_IMAGE_RECLAIM_MS,
} from '../../lib/nina/imagerecipe.ts'
import type { NinaImageJobArgs } from '../../lib/nina/imagerecipe.ts'

import type { NeonSql } from './sql.ts'

export interface ClaimedJob {
  jobId: string
  userId: string
  args: NinaImageJobArgs
  attempts: number
}

/**
 * **The instant a `dispatched` row becomes claimable. FINDING 2, in one function.**
 *
 * `fireNinaImageDispatch` stamps `error_code = 'dispatched'` BEFORE it POSTs to GitHub — deliberately,
 * so two concurrent dispatch attempts cannot both call the API — and a GitHub runner takes ~25-40 s
 * to reach the `Generate` step. Measured: job `ke20AUHNE0TB` was created at `03:02:31.897Z` and the
 * worker ran at `03:03:00.4Z`, 28.5 seconds old. With a single cutoff of `now - GRACE` the row is
 * `dispatched` and younger than 60 s, so the `WHERE` excluded it, and every one of the five
 * `workflow_dispatch` runs on 2026-09-06 logged `finished { attempted: 0 }`. **The doorbell rang a
 * runner that was structurally forbidden from opening the door.**
 *
 * The grace exists to stop a SWEEP stealing a job a runner is about to start. A job named by `--job`
 * was named by the doorbell, so the name and the runner ARE the same event and there is nothing to
 * protect it from. So:
 *
 *   · sweep      (`jobId == null`) -> `now - GRACE`. A fresh dispatch is left alone.
 *   · named job  (`jobId != null`) -> `now + GRACE`. Claimable however young it is.
 *
 * The named cutoff runs the window FORWARD rather than simply using `now`, and that is not
 * decoration: `created_at` is stamped by Vercel and `now` is read on a GitHub runner, so a minute of
 * clock skew between the two must not be able to reintroduce the bug. It reuses the same constant so
 * there is no second number to keep in step.
 *
 * **What this does NOT relax.** The `running` reclaim cutoff still applies to a named job, so a
 * dispatch can never steal a job another runner is mid-generation on and bill the same picture
 * twice. Neither does it relax `attempts < NINA_IMAGE_MAX_ATTEMPTS` — see `claimJob`'s note, where
 * that bound is the only thing preventing an infinite reclaim loop.
 */
export function dispatchCutoffFor(jobId: string | null, now: Date): Date {
  return jobId == null
    ? new Date(now.getTime() - NINA_IMAGE_DISPATCH_GRACE_MS)
    : new Date(now.getTime() + NINA_IMAGE_DISPATCH_GRACE_MS)
}

/**
 * **The only lock in the system.** One conditional UPDATE, and exactly one caller gets a row back.
 *
 * With a job id it claims that job. Without one it claims the oldest ACTIONABLE job, which is:
 *   · `queued`     — the doorbell never rang, or rang and the bookkeeping died;
 *   · `dispatched` past `dispatchCutoffFor` — for a sweep that means older than
 *     `NINA_IMAGE_DISPATCH_GRACE_MS`, i.e. GitHub accepted it and no runner ever picked it up; for a
 *     NAMED job it means unconditionally, because the runner asking IS the dispatch (Finding 2);
 *   · `running` older than `NINA_IMAGE_RECLAIM_MS` — the runner that owned it was killed by
 *     `timeout-minutes`, which is longer than the ceiling so it cannot still be alive. **This one is
 *     not relaxed for a named job**: a live generation must never be claimed twice.
 *
 * `attempts` is incremented in the same statement, so the retry budget cannot be spent twice by two
 * runners. A job at the budget is not claimed at all; the app-side sweep closes it instead.
 *
 * **One note on `created_at` in the WHERE clause.** It is the job's OPEN time, not its claim time,
 * because `nina_turns` has no claim timestamp and no phase has added one. For a first attempt the
 * two are within a minute of each other, so it is a fine proxy. For a SECOND attempt the timestamp
 * is already old, which would make a reclaimed job immediately eligible again — and the only thing
 * stopping an infinite reclaim loop is `attempts < NINA_IMAGE_MAX_ATTEMPTS` in the same clause.
 * **That bound is therefore load-bearing, not a nicety.** If a future phase adds a `claimed_at`
 * column, the cutoff should move to it and the bound should stay.
 */
export async function claimJob(
  sql: NeonSql,
  jobId: string | null,
  now: Date = new Date(),
): Promise<ClaimedJob | null> {
  const dispatchCutoff = dispatchCutoffFor(jobId, now)
  const runningCutoff = new Date(now.getTime() - NINA_IMAGE_RECLAIM_MS)

  const rows = (await sql`
    update nina_turns set
      error_code = 'running',
      args = jsonb_set(args, '{attempts}', to_jsonb((coalesce((args->>'attempts')::int, 0) + 1)))
    where id = (
      select id from nina_turns
      where kind = 'image'
        and status = 'pending'
        and args is not null
        and coalesce((args->>'attempts')::int, 0) < ${NINA_IMAGE_MAX_ATTEMPTS}
        and (${jobId}::text is null or id = ${jobId}::text)
        and (
          error_code = 'queued'
          or (error_code = 'dispatched' and created_at < ${dispatchCutoff.toISOString()})
          or (error_code = 'running' and created_at < ${runningCutoff.toISOString()})
        )
      order by created_at asc
      limit 1
      for update skip locked
    )
    returning id, user_id, args
  `) as Array<{ id: string; user_id: string; args: NinaImageJobArgs }>

  const row = rows[0]
  if (row == null) return null
  return {
    jobId: row.id,
    userId: row.user_id,
    args: row.args,
    attempts: Number(row.args.attempts ?? 0),
  }
}
