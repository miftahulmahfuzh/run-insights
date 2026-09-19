import 'server-only'

import { put } from '@vercel/blob'
import { after } from 'next/server'
import sharp from 'sharp'

import { blobEnv } from '@/lib/env'
import { newId } from '@/lib/id'
import { contentHashOf } from '@/lib/photos/contentHash'

import { logNinaError } from './errorlogs'
import { callNinaImageModel, type NinaImageCropBox } from './imagecall'
import {
  NINA_IMAGE_CACHE_MAX_AGE,
  NINA_IMAGE_CONTENT_TYPE,
  nearestNinaImageAspectRatio,
  ninaImageAspectRatioValue,
} from './imagerecipe'
import { photoshopCropBox } from './photoshopCrop'
import {
  claimNinaPhotoshopJob,
  completeNinaPhotoshopJob,
  failNinaPhotoshopJob,
  requeueNinaPhotoshopJob,
  NINA_PHOTOSHOP_MAX_ATTEMPTS,
  type NinaPhotoshopJobArgs,
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
 * **The job row's crop, turned into something `sharp` can apply — or nothing at all.**
 *
 * The all-or-nothing convention is `nina_avatars`' own, widened by one field: four NULLs (or any
 * one of the four NULL) means "the admin skipped the crop step", and this returns null, and
 * `attemptPhotoshopOnce` runs the code it ran before this feature existed. A partial set is
 * treated as absent rather than as a crop with defaults — a half-written crop is not a crop the
 * admin ever looked at, and guessing the missing half is how a photo gets cropped somewhere nobody
 * chose. (`runPhotoshopJobAction` coerces partials away at the boundary too, in Phase 4; this is
 * the second of the two, because the row can also be written by a future caller.)
 *
 * **This function is the ONLY place in this phase that names a Phase 1 or Phase 2 symbol** —
 * `photoshopCropBox`, `ninaImageAspectRatioValue`, and the four `args.crop*` fields. If either
 * phase landed a different spelling, this body is the whole edit.
 *
 * `photoshopCropBox` itself returns `null` for a source/ratio pair no integer rectangle can express
 * (a 3x2 thumbnail asked for 1:8) — Phase 1's documented contract, and it means exactly what the
 * bounds checks below mean: no crop, today's behaviour, not a failed job.
 *
 * The bounds re-check after `photoshopCropBox` is not distrust of Phase 1's clamping; it is the
 * difference between two failure modes. A box that overhangs makes `sharp` refuse and the job lose
 * its anchor entirely; returning null here instead degrades to "no crop", which is today's shipped
 * behaviour and a photograph the operator can use. The cheaper failure is the better one, and the
 * expensive one is still reachable (the stored `sourceWidth`/`sourceHeight` can, in principle,
 * disagree with the bytes that actually arrive) — `imagecall.ts` warns loudly when it happens.
 */
function photoshopCropFor(
  args: NinaPhotoshopJobArgs,
  sourceWidth: number | null,
  sourceHeight: number | null,
): { ratioLabel: string; box: NinaImageCropBox } | null {
  const { cropRatioLabel, cropScale, cropX, cropY } = args
  if (cropRatioLabel == null || cropScale == null || cropX == null || cropY == null) return null
  if (sourceWidth == null || sourceHeight == null) return null
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return null
  if (!Number.isFinite(cropScale) || !Number.isFinite(cropX) || !Number.isFinite(cropY)) return null

  /* The stored label must still be one the provider accepts. A label that fell out of the enum
   * between the click and the run is not a ratio we may send, and it is not worth failing a job
   * over either — the nearest-bucket fallback below is exactly what a job with no crop gets.
   * `ninaImageAspectRatioValue` answers "is it catalogued" and "what is it numerically" in one
   * call: `null` is the miss, and it is the same closed set Phase 4's boundary check reads. */
  const targetRatio = ninaImageAspectRatioValue(cropRatioLabel)
  if (targetRatio == null) return null

  /* Argument order is Phase 1's: SOURCE, then TARGET RATIO, then the crop. */
  const box = photoshopCropBox({ width: sourceWidth, height: sourceHeight }, targetRatio, {
    scale: cropScale,
    x: cropX,
    y: cropY,
  })
  if (box == null) return null
  if (box.width < 1 || box.height < 1) return null
  if (box.left < 0 || box.top < 0) return null
  if (box.left + box.width > sourceWidth) return null
  if (box.top + box.height > sourceHeight) return null

  return { ratioLabel: cropRatioLabel, box }
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

  /* **The admin's aspect-ratio crop, when they used it.** It overrides BOTH modes' fallback and it
   * overrides them identically, because it needs no guessing: the rectangle IS one of the
   * provider's exact `aspect_ratio` values, so the label below is the truth about the bytes rather
   * than the nearest bucket to them. Anchor mode's fixed `NINA_IMAGE_ASPECT` default and edit
   * mode's `nearestNinaImageAspectRatio` both survive UNCHANGED as the no-crop path. */
  const crop = photoshopCropFor(claim.args, sourceWidth, sourceHeight)

  /* **The 2026-09-19 edit-mode aspect fix** (`nearestNinaImageAspectRatio`'s own header), now the
   * middle branch. Anchor mode with no crop keeps `buildImageRequestBody`'s fixed
   * `NINA_IMAGE_ASPECT` default — a deliberate stylistic choice for a fresh generation — by
   * passing `undefined` here. */
  const aspectRatio =
    crop != null
      ? crop.ratioLabel
      : claim.args.mode === 'edit' && sourceWidth != null && sourceHeight != null
        ? nearestNinaImageAspectRatio(sourceWidth, sourceHeight)
        : undefined

  const outcome = await callNinaImageModel(
    claim.args.promptText,
    seed,
    sourceUrl,
    claim.args.model,
    resolution,
    aspectRatio,
    crop?.box,
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

  /* A crop that was asked for and did not happen is the one failure this feature can have that
   * costs money and looks like success: the picture comes back, billed, composed onto the ratio the
   * label promised, from bytes that were never cropped to it. `fetchNinaImageReference` refuses to
   * send uncropped bytes under an exact label — it drops the anchor instead — so the symptom is
   * always `anchored: false`, and this is where the job log says so. */
  if (crop != null && !outcome.anchored) {
    console.warn('[photoshop] crop requested but the reference was dropped — nothing was cropped', {
      jobId,
      ratioLabel: crop.ratioLabel,
      box: crop.box,
    })
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
