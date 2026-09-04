import 'server-only'

import { after } from 'next/server'

import { ninaEnv } from '@/lib/env'

import { classifyImageFailure } from './imagefail'
import { failNinaImageJob, markNinaImageJobDispatched } from './imagejobs'
import { NINA_IMAGE_DISPATCH_TIMEOUT_MS, type NinaImagePurpose } from './imagerecipe'

/**
 * **RU-20: the generator lives on GitHub Actions, and this file is the doorbell.**
 *
 * ── WHY NOT A VERCEL ROUTE, A QUEUE, OR A BOX ─────────────────────────────────────────────────
 * The shipping generation is 78.2 s measured and the Hobby ceiling in `sin1` is 60 s, so the work
 * cannot happen on Vercel at all — not in a Server Action, not in a route handler, not in `after()`.
 * QStash and Inngest do not help: both are HTTP callback queues, and the thing they would call back
 * is a Vercel function with the same 60 s ceiling. Inngest's step model cannot split a single 78 s
 * `fetch` into steps, and its steps run in our function, not theirs. A Fly or Railway worker would
 * work and would be a container to maintain for six images a day. GitHub Actions is already here,
 * already holds secrets, is unattended, and its job ceiling is six hours.
 *
 * ── THE COORDINATES ARE CONSTANTS, NOT ENVIRONMENT (RULING C4) ────────────────────────────────
 * `NINA_WORKER_REPO`, `NINA_WORKER_WORKFLOW` and `NINA_WORKER_REF` are facts about THIS repository,
 * not deployment configuration. As constants a misconfigured deploy cannot dispatch at somebody
 * else's repo, and a preview deployment dispatches the same workflow as production — which is
 * correct, because the worker's own secrets decide which database it writes. As env vars they would
 * be three more things to get wrong for no gain.
 *
 * The ONE secret is `GITHUB_DISPATCH_TOKEN`, read through `ninaEnv()`. It is never read from
 * `process.env` in `app/`, `lib/` or `components/`, and it is never `NEXT_PUBLIC_` anything —
 * invariant 10, and `ci:client-secret-guard` fails the build over both.
 *
 * ── THE ONLY INPUT IS AN OPAQUE JOB ID, AND THAT IS DELIBERATE ────────────────────────────────
 * **The repository is public**, so `workflow_dispatch` inputs are world-readable in the run log and
 * in the Actions UI. The scene prose and the user id therefore do NOT travel as inputs; they live in
 * `nina_turns.args` (RULING C1). A nanoid is the only thing published, and it names a row nobody
 * without `DATABASE_URL` can read.
 */

export const NINA_WORKER_REPO = 'miftahulmahfuzh/run-insights'
export const NINA_WORKER_WORKFLOW = 'nina-image.yml'
/**
 * `workflow_dispatch` resolves the workflow FILE from the ref it is given, and GitHub only accepts a
 * dispatch for a workflow that exists on the DEFAULT BRANCH. So `main`, always — a feature branch
 * cannot dispatch its own not-yet-merged workflow, which is the first thing to remember when this
 * returns 404 during development. See the plan's §Verification for how to test before the merge.
 */
export const NINA_WORKER_REF = 'main'

export function githubDispatchUrl(): string {
  return `https://api.github.com/repos/${NINA_WORKER_REPO}/actions/workflows/${NINA_WORKER_WORKFLOW}/dispatches`
}

/**
 * One POST. **It never throws** — a dispatch that fails is a `{ ok: false, detail }` so the caller
 * can turn it into one of her sentences, which is the same contract every other function in this
 * phase honours.
 *
 * GitHub answers **204 No Content** on success and gives back no run id at all. That is fine: the
 * correlation key is the job id, and the worker's first act is to claim that row.
 */
export async function dispatchNinaImageJob(
  jobId: string,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const { GITHUB_DISPATCH_TOKEN } = ninaEnv()

  let res: Response
  try {
    res = await fetch(githubDispatchUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_DISPATCH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        // GitHub rejects an API request with no User-Agent.
        'User-Agent': 'run-insights-nina',
      },
      body: JSON.stringify({ ref: NINA_WORKER_REF, inputs: { job_id: jobId } }),
      signal: AbortSignal.timeout(NINA_IMAGE_DISPATCH_TIMEOUT_MS),
      cache: 'no-store',
    })
  } catch (cause) {
    return { ok: false, detail: `dispatch: ${String(cause)}` }
  }

  if (res.status === 204) return { ok: true }

  /*
   * The four failures worth naming in a log, because each has a different one-time fix and a human
   * reading this line at 11pm should not have to guess:
   *   401 — the PAT is wrong, expired, or revoked.
   *   403 — the PAT lacks `actions: write`, or Actions is disabled for the repository.
   *   404 — the workflow file is not on `main` yet (the most likely one during development), or the
   *         PAT cannot see the repository at all.
   *   422 — the ref does not exist, or an input name is not declared in the workflow's `inputs`.
   */
  const body = await res.text().catch(() => '')
  return { ok: false, detail: `dispatch HTTP ${res.status} ${body.slice(0, 300)}` }
}

/**
 * Fire the doorbell without making the chat turn wait for it, and **close the job immediately if the
 * doorbell is broken.**
 *
 * ── THE ORDER IS LOAD-BEARING ─────────────────────────────────────────────────────────────────
 * `markNinaImageJobDispatched` runs FIRST, conditionally on the row still being `queued`. Two
 * concurrent dispatch attempts therefore cannot both call the API, and the loser exits silently. If
 * the API call then fails we fail the job outright rather than leaving a `dispatched` row for a
 * runner that will never come: a refused dispatch is the ONE failure in this design we learn about
 * within a second, so it is the one the runner should not wait 20 minutes for. Everything else falls
 * through to the backstop or the give-up sweep.
 *
 * ── WHY `after()` AND NOT A BARE FLOATING PROMISE ─────────────────────────────────────────────
 * A floating promise in a Server Action can be cut off the instant the response is flushed.
 * `after()` is documented to "run for the platform's default or configured max duration of your
 * route" and to be "executed even if the response didn't complete successfully" — exactly the
 * guarantee a doorbell needs. It is also why the timeout is 8 s: this shares the page's budget
 * (`export const maxDuration = 60` on `app/nina/page.tsx`) with a turn that has already spent
 * 13-45 s of it.
 */
export function fireNinaImageDispatch(input: {
  userId: string
  jobId: string
  purpose: NinaImagePurpose
  replyToId: string | null
}): void {
  const { userId, jobId, purpose, replyToId } = input

  after(async () => {
    try {
      if (!(await markNinaImageJobDispatched(userId, jobId))) {
        console.info('[nina] image job already dispatched, doorbell skipped', { jobId })
        return
      }

      const result = await dispatchNinaImageJob(jobId)
      if (result.ok) {
        console.info('[nina] image job dispatched', { jobId, purpose })
        return
      }

      /*
       * `classifyImageFailure` with no status and no body returns `transport`, which is the honest
       * kind: from the runner's side the photograph did not come through. Her apology says the
       * signal was bad. It was — ours.
       */
      await failNinaImageJob({
        userId,
        jobId,
        kind: classifyImageFailure({ cause: new Error(result.detail) }),
        purpose,
        replyToId,
        detail: result.detail,
      })
    } catch (cause) {
      /*
       * The dispatch bookkeeping itself broke — a dead connection, a bug. The row stays `pending`
       * and the backstop schedule will find it within ~10 minutes; if GitHub is also unreachable,
       * the on-read give-up sweep closes it at 20. This is the one path in the phase that relies on
       * a later mechanism rather than closing the job itself, and both later mechanisms exist.
       */
      console.error('[nina] image dispatch bookkeeping failed', { jobId, error: String(cause) })
    }
  })
}
