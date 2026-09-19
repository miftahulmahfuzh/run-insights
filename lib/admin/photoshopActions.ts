'use server'

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/admin/requireAdmin'
import type { NinaPhotoshopResolution, NinaPhotoshopSourceKind } from '@/lib/db/schema'
import { isValidId } from '@/lib/id'
import { ninaImageAspectRatioValue } from '@/lib/nina/imagerecipe'
import {
  NINA_PHOTOSHOP_CROP_MAX_ABS_OFFSET,
  NINA_PHOTOSHOP_CROP_MAX_SCALE,
  NINA_PHOTOSHOP_CROP_MIN_SCALE,
} from '@/lib/nina/photoshopCrop'
import {
  getNinaPhotoshopJob,
  isNinaPhotoshopJobStale,
  openNinaPhotoshopJob,
} from '@/lib/nina/photoshopJobs'
import {
  coercePhotoshopInstruction,
  coercePhotoshopMode,
  coercePhotoshopModel,
} from '@/lib/nina/photoshopPresets'
import {
  getPhotoshopSourcePhoto,
  resolvePhotoshopAdd,
  resolvePhotoshopDiscard,
  resolvePhotoshopReplace,
} from '@/lib/nina/photoshopResolve'
import { firePhotoshopJob } from '@/lib/nina/photoshopRun'

/**
 * `/admin/photoshop/[source]/[id]`'s writes. `saveNinaImagePrefsAction`'s order in every export:
 * `requireAdmin()` first, then the untrusted input is narrowed by hand (no Zod schema here —
 * five scalar fields and one id, cheap enough to check inline without a second file to keep in
 * step with this one).
 */

/* ── The crop step's untrusted input ──────────────────────────────────────────────────────────
 *
 * The four columns are all-or-nothing: all four set, or all four NULL. A PARTIAL set is coerced
 * to "no crop" rather than completed with defaults — a crop rectangle missing its ratio (or its
 * offsets) is not a crop, and inventing the missing member is how a job silently sends the model
 * the wrong region of the photo with nothing failing anywhere.
 *
 * The bounds here are a COARSE sanity gate, not the real clamp. The exact, dimension-aware clamp
 * lives in `lib/nina/photoshopCrop.ts` — the browser applies it on every drag, and the pixel
 * crop-box function applies it again against the source's own bounds when the job actually runs.
 * This boundary only has to refuse nonsense before it reaches a `numeric(5,3)` column.
 *
 * A rejected crop does NOT fail the run: it degrades to today's uncropped behaviour, which is
 * exactly what "the admin skipped the crop step" already means. Only a hand-crafted request can
 * land here — the picker can emit nothing but catalogued labels — so refusing the whole job would
 * trade a working photoshop run for a scolding nobody is present to read. */

/** `numeric(5,3)`: the column holds three decimals, so a scale that survives this boundary is
 * already the number the row will store. Rounding here, not at read time, keeps the value the
 * admin chose and the value Phase 3 crops with identical. */
const PHOTOSHOP_CROP_SCALE_DECIMALS = 3

/** The four crop columns as the job row holds them. */
interface PhotoshopCropFields {
  cropRatioLabel: string | null
  cropScale: number | null
  cropX: number | null
  cropY: number | null
}

/** "No crop, behave as today" — the value every pre-crop job row already reads back. */
const PHOTOSHOP_NO_CROP: PhotoshopCropFields = {
  cropRatioLabel: null,
  cropScale: null,
  cropX: null,
  cropY: null,
}

/** The closed set is `NINA_IMAGE_ASPECT_RATIOS` itself — the same table `nearestNinaImageAspectRatio`
 * picks from and the same one Phase 5's `<select>` renders, so the picker and this check can never
 * disagree about which labels exist. Asked through Phase 1's `ninaImageAspectRatioValue`, whose
 * `null` IS the membership miss: "is this one of the provider's 23 values" and "what is it
 * numerically" are one question asked twice, and one function answering both is one place to be
 * wrong. Exact string match, no trimming, no case folding — the label goes on the wire verbatim as
 * `aspect_ratio`, so a value this accepts must be a value the provider accepts. */
function isCataloguedAspectRatio(label: string): boolean {
  return ninaImageAspectRatioValue(label) != null
}

function coercePhotoshopCrop(input: {
  cropRatioLabel?: string | null
  cropScale?: number | null
  cropX?: number | null
  cropY?: number | null
}): PhotoshopCropFields {
  const label = input.cropRatioLabel
  const scale = input.cropScale
  const x = input.cropX
  const y = input.cropY

  if (
    typeof label !== 'string' ||
    typeof scale !== 'number' ||
    typeof x !== 'number' ||
    typeof y !== 'number'
  ) {
    return PHOTOSHOP_NO_CROP
  }

  if (!isCataloguedAspectRatio(label)) return PHOTOSHOP_NO_CROP

  if (
    !Number.isFinite(scale) ||
    scale < NINA_PHOTOSHOP_CROP_MIN_SCALE ||
    scale > NINA_PHOTOSHOP_CROP_MAX_SCALE
  ) {
    return PHOTOSHOP_NO_CROP
  }

  if (!Number.isFinite(x) || Math.abs(x) > NINA_PHOTOSHOP_CROP_MAX_ABS_OFFSET) {
    return PHOTOSHOP_NO_CROP
  }
  if (!Number.isFinite(y) || Math.abs(y) > NINA_PHOTOSHOP_CROP_MAX_ABS_OFFSET) {
    return PHOTOSHOP_NO_CROP
  }

  const factor = 10 ** PHOTOSHOP_CROP_SCALE_DECIMALS
  /* `+ 0` normalises negative zero, `lib/nina/crop.ts:210`'s own reason: `Math.round(-0)` is `-0`,
   * it compares equal to `0` everywhere but `Object.is` (and so `toEqual`) tells them apart, and
   * `integer` round-trips it as `0` anyway. One sign, always. */
  return {
    cropRatioLabel: label,
    cropScale: Math.round(scale * factor) / factor,
    cropX: Math.round(x) + 0,
    cropY: Math.round(y) + 0,
  }
}

export type PhotoshopRunResult = { ok: true; jobId: string } | { ok: false; message: string }

export async function runPhotoshopJobAction(input: {
  sourceKind: NinaPhotoshopSourceKind
  sourceId: string
  mode: string
  model: string
  presetKey: string | null
  instruction: string
  /** The optional aspect-ratio crop step (R1). All four together, or all four absent — a partial
   * set is coerced to "no crop". Absent on every call that predates the crop UI, and on every
   * `scripts/photoshop.ts` run, which has no rectangle to drag. */
  cropRatioLabel?: string | null
  cropScale?: number | null
  cropX?: number | null
  cropY?: number | null
}): Promise<PhotoshopRunResult> {
  const { userId } = await requireAdmin()

  if (input.sourceKind !== 'avatar' && input.sourceKind !== 'message_image') {
    return { ok: false, message: 'Unknown photo source.' }
  }
  if (!isValidId(input.sourceId)) return { ok: false, message: 'Unknown photo.' }

  const instruction = coercePhotoshopInstruction(input.instruction)
  if (instruction === '') {
    return {
      ok: false,
      message: 'Type what should change, or pick a preset, before running photoshop.',
    }
  }

  const source = await getPhotoshopSourcePhoto(userId, input.sourceKind, input.sourceId)
  if (source == null) return { ok: false, message: 'That photo could not be found.' }

  const mode = coercePhotoshopMode(input.mode)
  const model = coercePhotoshopModel(mode, input.model)
  const presetKey =
    typeof input.presetKey === 'string' && input.presetKey !== '' ? input.presetKey : null
  const crop = coercePhotoshopCrop(input)

  const jobId = await openNinaPhotoshopJob(userId, {
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceContentHash: source.contentHash,
    mode,
    model,
    presetKey,
    promptText: instruction,
    cropRatioLabel: crop.cropRatioLabel,
    cropScale: crop.cropScale,
    cropX: crop.cropX,
    cropY: crop.cropY,
  })

  /* The crop is NOT passed here. `attemptPhotoshopOnce` reads it back off the row through
   * `claimNinaPhotoshopJob` (Phase 3), the same way it reads mode, model and prompt — one source
   * of truth for what the job is, and the retry path gets it for free. */
  firePhotoshopJob({
    userId,
    jobId,
    sourceUrl: source.blobUrl,
    sourceWidth: source.width,
    sourceHeight: source.height,
  })

  return { ok: true, jobId }
}

export interface PhotoshopJobView {
  jobId: string
  status: 'pending' | 'ok' | 'failed'
  /** A `pending` row old enough its invocation almost certainly died. The panel stops polling and
   * says so rather than spinning forever. */
  stale: boolean
  errorCode: string | null
  resultUrl: string | null
  resolvedAction: NinaPhotoshopResolution | null
}

export async function readPhotoshopJobAction(jobId: string): Promise<PhotoshopJobView | null> {
  const { userId } = await requireAdmin()
  if (!isValidId(jobId)) return null

  const job = await getNinaPhotoshopJob(userId, jobId)
  if (job == null) return null

  return {
    jobId: job.id,
    status: job.status,
    stale: isNinaPhotoshopJobStale(job),
    errorCode: job.errorCode,
    resultUrl: job.resultBlobUrl,
    resolvedAction: job.resolvedAction,
  }
}

export type PhotoshopResolveActionResult = { ok: true } | { ok: false; message: string }

export async function resolvePhotoshopJobAction(input: {
  jobId: string
  action: 'replace' | 'add' | 'discard'
}): Promise<PhotoshopResolveActionResult> {
  const { userId } = await requireAdmin()
  if (!isValidId(input.jobId)) return { ok: false, message: 'Unknown job.' }

  const outcome =
    input.action === 'replace'
      ? await resolvePhotoshopReplace(userId, input.jobId)
      : input.action === 'add'
        ? await resolvePhotoshopAdd(userId, input.jobId)
        : await resolvePhotoshopDiscard(userId, input.jobId)

  if (!outcome.ok) {
    const message =
      outcome.reason === 'not-found'
        ? 'That job could not be found.'
        : outcome.reason === 'not-ready'
          ? 'The photograph is not ready yet.'
          : outcome.reason === 'already-resolved'
            ? 'Already handled — nothing left to do.'
            : 'The original photo is gone, so nothing was written.'
    return { ok: false, message }
  }

  revalidatePath('/admin/photoshop')
  return { ok: true }
}
