import 'server-only'

import { JOB_DEADLINE_MS, UPLOAD_CONTENT_TYPE, type ScreenKind } from '@/lib/extract/constants'
import { markExtractionFailed, markExtractionOk, markExtractionRepaired } from '@/lib/db/queries'
import type { ExtractedSession } from '@/lib/schema/extractedSession'
import type { ExtractionBlobRef } from '@/lib/schema/extractionResult'
import { extractSession, productionDeps, type ExtractDeps } from './extract'
import type { PromptImage } from './prompts/extraction'

/**
 * The body of `after()` in `POST /api/extract` — the whole of D4's background job.
 *
 * It runs after the 202 has already been sent, inside the same serverless invocation, and it owns
 * exactly one promise: **this function always writes a terminal `extractions` row.** Every path
 * out of it, including an unexpected throw, ends in `ok`, `repaired` or `failed`. The stale-
 * pending self-heal in `GET /api/extract/[id]` exists for the one case this cannot cover — the
 * invocation being killed outright — not as a substitute for handling errors here.
 */

/** What `extractions.raw_response` holds. A convention on an existing jsonb column, not a migration. */
export interface RawResponseColumn {
  /** The exact JSON body the endpoint returned (the repair call's, if one happened). */
  vendor: unknown
  /**
   * The Zod-validated result, stored pre-validated so `GET` is a pure read. The poll endpoint
   * must never re-run extraction logic: re-parsing on every poll could disagree with what was
   * actually written (a different `kindsPresent`, a changed schema after a deploy), and
   * "the numbers changed while I was looking at them" is the one thing D1 cannot tolerate.
   */
  parsedSession: ExtractedSession | null
  attempts: 1 | 2
}

/**
 * Fetch one uploaded screenshot back out of Blob and re-encode it as a base64 data URI.
 *
 * §2.2: a data URI, not the hosted Blob URL, even though the bytes are already on a public CDN.
 * This matches the measured recipe (`research/lib.mjs`'s `imgPart`) exactly. A `url:`-only
 * `image_url` pointing at the Blob URL was never probed against this endpoint, and per §1's whole
 * lesson, an untested request shape on this vendor is not something to trust in production —
 * especially when the failure mode is "200 OK with invented numbers".
 */
async function toDataUri(ref: ExtractionBlobRef, signal: AbortSignal): Promise<PromptImage> {
  const res = await fetch(ref.url, { signal, cache: 'no-store' })
  if (!res.ok) throw new Error(`blob fetch ${res.status} for ${ref.pathname}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.byteLength === 0) throw new Error(`blob ${ref.pathname} was empty`)
  return {
    kind: ref.kind,
    // Compression always emits JPEG and the upload route allows only image/jpeg, so the media
    // type is known rather than sniffed.
    dataUri: `data:${UPLOAD_CONTENT_TYPE};base64,${bytes.toString('base64')}`,
  }
}

export interface RunExtractionJobInput {
  userId: string
  extractionId: string
  images: ExtractionBlobRef[]
  /** When the route started, so the job's deadline covers the whole invocation, not just itself. */
  invocationStartedAt: number
}

export async function runExtractionJob(
  input: RunExtractionJobInput,
  deps: ExtractDeps = productionDeps,
): Promise<void> {
  const { userId, extractionId, images } = input
  const deadlineAt = input.invocationStartedAt + JOB_DEADLINE_MS

  try {
    // 10 s for three ~60 KB fetches from a CDN in the same region is generous; if Blob is that
    // slow, spending the rest of the budget on a vision call that cannot finish is worse than
    // failing now with a code that says so.
    const blobTimeout = Math.min(10_000, Math.max(1_000, deadlineAt - deps.now()))
    let prompt: PromptImage[]
    try {
      prompt = await Promise.all(
        images.map((ref) => toDataUri(ref, AbortSignal.timeout(blobTimeout))),
      )
    } catch (cause) {
      console.error('[f04] blob fetch failed', { extractionId, cause })
      await markExtractionFailed(userId, extractionId, 'transport', {
        vendor: null,
        parsedSession: null,
        attempts: 1,
      } satisfies RawResponseColumn)
      return
    }

    // Derived from OUR upload records. The model's answer never feeds this set — that is the
    // whole point of the provenance guard.
    const kindsPresent: ReadonlySet<ScreenKind> = new Set(images.map((i) => i.kind))

    const remaining = deadlineAt - deps.now()
    const outcome = await extractSession(deps, prompt, kindsPresent, remaining)

    const rawResponse: RawResponseColumn = {
      vendor: outcome.rawVendorResponse,
      parsedSession: outcome.session,
      attempts: outcome.attempts,
    }

    if (outcome.status === 'ok') {
      await markExtractionOk(userId, extractionId, rawResponse, outcome.promptTokens)
    } else if (outcome.status === 'repaired') {
      await markExtractionRepaired(userId, extractionId, rawResponse, outcome.promptTokens)
    } else {
      // The canary is worth storing even on the failure path — a `token_floor` row whose
      // prompt_tokens reads 141 is the difference between "the vendor dropped the images" and
      // "the model wrote bad JSON", months after the fact.
      await markExtractionFailed(
        userId,
        extractionId,
        outcome.errorCode ?? 'transport',
        rawResponse,
        outcome.promptTokens,
      )
      console.warn('[f04] extraction failed', {
        extractionId,
        errorCode: outcome.errorCode,
        promptTokens: outcome.promptTokens,
      })
    }
  } catch (cause) {
    // Last resort. Anything that reaches here is a bug, not a vendor failure — but the row still
    // must not be left pending, so it is closed and the cause is logged loudly.
    console.error('[f04] extraction job crashed', { extractionId, cause })
    try {
      await markExtractionFailed(userId, extractionId, 'transport', {
        vendor: null,
        parsedSession: null,
        attempts: 1,
      } satisfies RawResponseColumn)
    } catch (writeFailure) {
      console.error('[f04] could not even record the failure', { extractionId, writeFailure })
    }
  }
}
