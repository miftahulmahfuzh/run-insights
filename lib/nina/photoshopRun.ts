import 'server-only'

import { put } from '@vercel/blob'
import { after } from 'next/server'

import { blobEnv } from '@/lib/env'
import { newId } from '@/lib/id'
import { contentHashOf } from '@/lib/photos/contentHash'

import { callNinaImageModel } from './imagecall'
import {
  NINA_IMAGE_CACHE_MAX_AGE,
  NINA_IMAGE_CONTENT_TYPE,
  NINA_IMAGE_HEIGHT,
  NINA_IMAGE_WIDTH,
} from './imagerecipe'
import {
  claimNinaPhotoshopJob,
  completeNinaPhotoshopJob,
  failNinaPhotoshopJob,
  requeueNinaPhotoshopJob,
  NINA_PHOTOSHOP_MAX_ATTEMPTS,
} from './photoshopJobs'

/**
 * Execution for one photoshop job. Reuses `callNinaImageModel` unmodified — confirmed generic
 * over `(prompt, seed, referenceUrl, model)`, no `NinaImageJobArgs` coupling — and its own small
 * blob-put rather than `lib/nina/imagerun.ts`'s `putNinaImageBlob`/`storeNinaImage`, which are
 * keyed to `NinaImagePurpose` (`'selfie' | 'avatar'`) and to a pathname regex asserted in
 * `tests/nina.imagerecipe.test.ts`. Widening that shared, heavily-pinned vocabulary for a third,
 * unrelated purpose is a bigger and riskier change than writing photoshop's own small put.
 */

const PHOTOSHOP_SEED_MAX = 2_147_483_647

function ninaPhotoshopPathname(userId: string, id: string): string {
  return `nina/${userId}/photoshop-${id}.png`
}

async function putPhotoshopBlob(
  userId: string,
  bytes: Buffer,
): Promise<{ blobUrl: string; pathname: string; contentHash: string }> {
  const contentHash = await contentHashOf(bytes)
  const blob = await put(ninaPhotoshopPathname(userId, newId()), bytes, {
    access: 'public',
    contentType: NINA_IMAGE_CONTENT_TYPE,
    addRandomSuffix: true,
    allowOverwrite: false,
    cacheControlMaxAge: NINA_IMAGE_CACHE_MAX_AGE,
    token: blobEnv().BLOB_READ_WRITE_TOKEN,
  })
  return { blobUrl: blob.url, pathname: blob.pathname, contentHash }
}

/**
 * One claim-call-store-finish cycle. `sourceUrl` is resolved by the caller on every attempt rather
 * than stored on the job row, so a source photo replaced mid-job is read honestly rather than off
 * a URL that may no longer serve what the admin picked.
 */
async function attemptPhotoshopOnce(
  userId: string,
  jobId: string,
  sourceUrl: string,
): Promise<'ok' | 'retry' | 'gave-up'> {
  const claim = await claimNinaPhotoshopJob(userId, jobId)
  if (claim == null) return 'gave-up'

  const seed = Math.floor(Math.random() * PHOTOSHOP_SEED_MAX)
  const outcome = await callNinaImageModel(claim.args.promptText, seed, sourceUrl, claim.args.model)

  if (!outcome.ok) {
    console.warn('[photoshop] model call failed', {
      jobId,
      kind: outcome.kind,
      attempt: claim.attempts,
    })
    if (claim.attempts < NINA_PHOTOSHOP_MAX_ATTEMPTS) {
      await requeueNinaPhotoshopJob(userId, jobId, outcome.costMicroUsd)
      return 'retry'
    }
    await failNinaPhotoshopJob(userId, jobId, outcome.kind, outcome.costMicroUsd)
    return 'gave-up'
  }

  try {
    const bytes = Buffer.from(outcome.b64, 'base64')
    const stored = await putPhotoshopBlob(userId, bytes)
    await completeNinaPhotoshopJob(userId, jobId, {
      costMicroUsd: outcome.costMicroUsd,
      resultBlobUrl: stored.blobUrl,
      resultPathname: stored.pathname,
      resultContentHash: stored.contentHash,
      resultWidth: NINA_IMAGE_WIDTH,
      resultHeight: NINA_IMAGE_HEIGHT,
      resultBytes: bytes.byteLength,
    })
    return 'ok'
  } catch (cause) {
    console.error('[photoshop] store/finish failed after a billed generation', {
      jobId,
      cause: String(cause),
    })
    await failNinaPhotoshopJob(userId, jobId, 'transport', outcome.costMicroUsd)
    return 'gave-up'
  }
}

export async function runPhotoshopJob(
  userId: string,
  jobId: string,
  sourceUrl: string,
): Promise<'ok' | 'retry' | 'gave-up'> {
  for (;;) {
    const outcome = await attemptPhotoshopOnce(userId, jobId, sourceUrl)
    if (outcome !== 'retry') return outcome
  }
}

/** Registers the job on the current invocation's remaining wall clock via `after()` —
 * `fireNinaImageGeneration`'s own shape. The calling route segment must carry `maxDuration = 300`
 * for the same reason `app/nina/page.tsx` does. Never throws. */
export function firePhotoshopJob(input: {
  userId: string
  jobId: string
  sourceUrl: string
}): void {
  const { userId, jobId, sourceUrl } = input
  after(async () => {
    try {
      const outcome = await runPhotoshopJob(userId, jobId, sourceUrl)
      console.info('[photoshop] job finished', { jobId, outcome })
    } catch (cause) {
      console.error('[photoshop] job threw', { jobId, error: String(cause) })
    }
  })
}
