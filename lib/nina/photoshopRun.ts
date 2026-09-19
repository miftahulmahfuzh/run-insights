import 'server-only'

import { put } from '@vercel/blob'
import { after } from 'next/server'
import sharp from 'sharp'

import { blobEnv } from '@/lib/env'
import { newId } from '@/lib/id'
import { contentHashOf } from '@/lib/photos/contentHash'

import { logNinaError } from './errorlogs'
import { callNinaImageModel } from './imagecall'
import {
  NINA_IMAGE_CACHE_MAX_AGE,
  NINA_IMAGE_CONTENT_TYPE,
  nearestNinaImageAspectRatio,
} from './imagerecipe'
import {
  claimNinaPhotoshopJob,
  completeNinaPhotoshopJob,
  failNinaPhotoshopJob,
  requeueNinaPhotoshopJob,
  NINA_PHOTOSHOP_MAX_ATTEMPTS,
} from './photoshopJobs'
import { photoshopModelResolution } from './photoshopPresets'

/**
 * Execution for one photoshop job. Reuses `callNinaImageModel` unmodified — confirmed generic
 * over `(prompt, seed, referenceUrl, model, resolution)`, no `NinaImageJobArgs` coupling — and
 * its own small blob-put rather than `lib/nina/imagerun.ts`'s `putNinaImageBlob`/`storeNinaImage`,
 * which are keyed to `NinaImagePurpose` (`'selfie' | 'avatar'`) and to a pathname regex asserted in
 * `tests/nina.imagerecipe.test.ts`. Widening that shared, heavily-pinned vocabulary for a third,
 * unrelated purpose is a bigger and riskier change than writing photoshop's own small put.
 */

const PHOTOSHOP_SEED_MAX = 2_147_483_647

function ninaPhotoshopPathname(userId: string, id: string): string {
  return `nina/${userId}/photoshop-${id}.png`
}

/**
 * **Measured, never guessed.** The 2026-09-19 incident that motivated this file's per-model
 * resolution override (`bytedance-seed/seedream-4.5` 400ing on a hardcoded 1K) is exactly why
 * dimensions are read off the actual bytes with `sharp` rather than recorded from a constant the
 * way `lib/nina/imagerun.ts`'s `NINA_IMAGE_WIDTH`/`HEIGHT` do — a fixed resolution per model was
 * already wrong once. Falls back to `0x0` on a decode failure (never a lost photograph over a
 * dimension nobody will act on).
 */
async function measureImageBytes(bytes: Buffer): Promise<{ width: number; height: number }> {
  try {
    const meta = await sharp(bytes, { failOn: 'none' }).metadata()
    return { width: meta.width ?? 0, height: meta.height ?? 0 }
  } catch {
    return { width: 0, height: 0 }
  }
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
  sourceWidth: number | null,
  sourceHeight: number | null,
): Promise<'ok' | 'retry' | 'gave-up'> {
  const claim = await claimNinaPhotoshopJob(userId, jobId)
  if (claim == null) return 'gave-up'

  const seed = Math.floor(Math.random() * PHOTOSHOP_SEED_MAX)
  const resolution = photoshopModelResolution(claim.args.model)
  /* **The 2026-09-19 edit-mode aspect fix** (`nearestNinaImageAspectRatio`'s own header). Anchor
   * mode keeps `buildImageRequestBody`'s fixed `NINA_IMAGE_ASPECT` default — a deliberate
   * stylistic choice for a fresh generation — by passing `undefined` here. */
  const aspectRatio =
    claim.args.mode === 'edit' && sourceWidth != null && sourceHeight != null
      ? nearestNinaImageAspectRatio(sourceWidth, sourceHeight)
      : undefined
  const outcome = await callNinaImageModel(
    claim.args.promptText,
    seed,
    sourceUrl,
    claim.args.model,
    resolution,
    aspectRatio,
  )

  if (!outcome.ok) {
    console.warn('[photoshop] model call failed', {
      jobId,
      kind: outcome.kind,
      attempt: claim.attempts,
    })
    /* R2's own rule, applied to a fourth caller: the classification alone never says WHY, so the
     * provider's raw words are logged here — on every failed call, not just the terminal one —
     * the same site `recordImageCallFailure` picks in `lib/nina/imagerun.ts` and for the same
     * reason: the requeue branch below never touches this table, so a job that burns both
     * attempts writes two rows here, one per attempt. */
    await logNinaError({
      category: 'photoshop',
      userId,
      provider: 'openrouter',
      model: claim.args.model,
      fullInput: claim.args.promptText,
      errorMessage: `[${outcome.kind}] ${outcome.detail}`,
      timeoutMs: outcome.timeoutMs,
      imageUrl: sourceUrl,
      jobId,
      sourceId: claim.args.sourceId,
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
    const [stored, dimensions] = await Promise.all([
      putPhotoshopBlob(userId, bytes),
      measureImageBytes(bytes),
    ])
    await completeNinaPhotoshopJob(userId, jobId, {
      costMicroUsd: outcome.costMicroUsd,
      resultBlobUrl: stored.blobUrl,
      resultPathname: stored.pathname,
      resultContentHash: stored.contentHash,
      resultWidth: dimensions.width,
      resultHeight: dimensions.height,
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
  sourceWidth: number | null = null,
  sourceHeight: number | null = null,
): Promise<'ok' | 'retry' | 'gave-up'> {
  for (;;) {
    const outcome = await attemptPhotoshopOnce(userId, jobId, sourceUrl, sourceWidth, sourceHeight)
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
  /** The source photo's own dimensions, straight off `getPhotoshopSourcePhoto` — absent (or
   * `null`) callers get the fixed `NINA_IMAGE_ASPECT` default, same as before this field existed. */
  sourceWidth?: number | null
  sourceHeight?: number | null
}): void {
  const { userId, jobId, sourceUrl, sourceWidth = null, sourceHeight = null } = input
  after(async () => {
    try {
      const outcome = await runPhotoshopJob(userId, jobId, sourceUrl, sourceWidth, sourceHeight)
      console.info('[photoshop] job finished', { jobId, outcome })
    } catch (cause) {
      console.error('[photoshop] job threw', { jobId, error: String(cause) })
    }
  })
}
