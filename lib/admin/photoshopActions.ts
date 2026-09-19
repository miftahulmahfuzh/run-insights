'use server'

import { revalidatePath } from 'next/cache'

import { requireAdmin } from '@/lib/admin/requireAdmin'
import type { NinaPhotoshopResolution, NinaPhotoshopSourceKind } from '@/lib/db/schema'
import { isValidId } from '@/lib/id'
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

export type PhotoshopRunResult = { ok: true; jobId: string } | { ok: false; message: string }

export async function runPhotoshopJobAction(input: {
  sourceKind: NinaPhotoshopSourceKind
  sourceId: string
  mode: string
  model: string
  presetKey: string | null
  instruction: string
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

  const jobId = await openNinaPhotoshopJob(userId, {
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    sourceContentHash: source.contentHash,
    mode,
    model,
    presetKey,
    promptText: instruction,
  })

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
