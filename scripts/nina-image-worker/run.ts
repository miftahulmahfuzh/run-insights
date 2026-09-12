/**
 * The job loop: claim, generate, close. One function, `runOneJob`, that returns what happened so
 * `main` can log one line per job and so the test can assert the branches without a network.
 *
 * Part of the `nina-image-worker/` split; the system-level doc — why this worker exists, why it is
 * `.ts`, what it cannot import, where it runs — lives in the barrel `../nina-image-worker.ts`. The
 * worker's import rules: `.ts`-suffixed relative imports only, no `@/` aliases, no `server-only`,
 * CJS packages through `createRequire`.
 */
import { coerceNinaImageModel } from '../../lib/nina/imageprefs.ts'
import { ninaImageReferenceUrl } from '../../lib/nina/imagerecipe.ts'

import { closeFailed, finishAvatar, finishSelfie } from './finish.ts'
import { generate } from './generate.ts'
import { store } from './store.ts'
import { claimJob } from './claim.ts'
import type { WorkerStoredImage } from './store.ts'
import type { NeonSql } from './sql.ts'

/**
 * Claim, generate, close. Returns what happened so `main` can log one line per job and so the test
 * can assert the branches without a network.
 *
 * **A store failure is a `transport` failure and not a crash.** The picture exists and we could not
 * keep it, which from the runner's side is "the photo did not come through" — and the money is
 * already spent, which is why it is still logged, still counted against the cap, and now also
 * recorded on the row (invariant 9).
 */
export async function runOneJob(
  sql: NeonSql,
  jobId: string | null,
): Promise<'none' | 'ok' | 'retry' | 'gave-up'> {
  const job = await claimJob(sql, jobId)
  if (job == null) return 'none'

  console.info('[nina-worker] claimed', {
    jobId: job.jobId,
    purpose: job.args.purpose,
    attempt: job.attempts,
  })

  const outcome = await generate(
    job.args.prompt,
    job.args.seed,
    ninaImageReferenceUrl(job.args),
    /* §8: an old jsonb row without the key coerces to the measured default, the same degrade the
     * in-platform host applies. */
    coerceNinaImageModel(job.args.model),
  )
  if (!outcome.ok) {
    return closeFailed(sql, job, {
      kind: outcome.kind,
      latencyMs: outcome.latencyMs,
      detail: outcome.detail,
      /* The call returned no figure, so what it cost is unknown. `closeFailed` adds nothing on a
       * retry — an unknown guessed twice for one picture is a worse log than a missing one — and
       * guesses high on the terminal attempt, where a timed-out call was very probably billed. */
      costMicroUsd: null,
    })
  }

  let image: WorkerStoredImage
  try {
    image = await store(sql, job.userId, job.args.purpose, outcome.b64)
  } catch (cause) {
    return closeFailed(sql, job, {
      kind: 'transport',
      latencyMs: outcome.latencyMs,
      detail: `store: ${String(cause)}`,
      /* The generation SUCCEEDED and was billed; only the storage failed. */
      costMicroUsd: outcome.costMicroUsd,
    })
  }

  try {
    if (job.args.purpose === 'avatar') {
      await finishAvatar(sql, job, image, outcome)
    } else {
      await finishSelfie(sql, job, image, outcome)
    }
  } catch (cause) {
    /*
     * The bytes are stored and the row could not be written. Closing it as a failure is the honest
     * outcome — no photograph is visible, so she should say so — and the blob is left behind, which
     * the plan's Handoff 6 (the `nina/` reaper) exists for.
     *
     * **This is the branch Finding 1 lived in**, and it reached `closeFailed` correctly every time.
     * What was broken was `closeFailed` itself, which threw the same way and killed the process
     * before the spend below could be recorded.
     */
    return closeFailed(sql, job, {
      kind: 'transport',
      latencyMs: outcome.latencyMs,
      detail: `finish: ${String(cause)}`,
      costMicroUsd: outcome.costMicroUsd,
    })
  }

  console.info('[nina-worker] done', {
    jobId: job.jobId,
    purpose: job.args.purpose,
    bytes: image.bytes,
    costMicroUsd: outcome.costMicroUsd,
    latencyMs: outcome.latencyMs,
  })
  return 'ok'
}
