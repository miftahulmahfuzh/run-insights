import 'server-only'

import {
  JOB_DEADLINE_MS,
  PRIMARY_SCREEN_KINDS,
  UPLOAD_CONTENT_TYPE,
  type PrimaryScreenKind,
  type ScreenKind,
} from '@/lib/extract/constants'
import { markExtractionFailed, markExtractionOk, markExtractionRepaired } from '@/lib/db/queries'
import { mergeWorkoutDetails } from '@/lib/extract/detailsMerge'
import type { DetailsPrinted, EstimatedValues } from '@/lib/schema/detailsPrinted'
import { RawExtractedSession, type ExtractedSession } from '@/lib/schema/extractedSession'
import type { ExtractionBlobRef } from '@/lib/schema/extractionResult'
import { extractSession, productionDeps, type ExtractDeps } from './extract'
import type { PromptImage } from './prompts/extraction'
import {
  productionDetailsDeps,
  readWorkoutDetails,
  type DetailsDeps,
  type DetailsReading,
} from './readDetails'

/**
 * The body of `after()` in `POST /api/extract` — the whole of D4's background job.
 *
 * It runs after the 202 has already been sent, inside the same serverless invocation, and it owns
 * exactly one promise: **this function always writes a terminal `extractions` row.** Every path
 * out of it, including an unexpected throw, ends in `ok`, `repaired` or `failed`. The stale-
 * pending self-heal in `GET /api/extract/[id]` exists for the one case this cannot cover — the
 * invocation being killed outright — not as a substitute for handling errors here.
 *
 * ── TWO CALLS, IN PARALLEL, WHEN A WORKOUT DETAILS SCREENSHOT IS PRESENT ────────────────────
 * The primary call gets ONLY the summary / splits / heart-rate images, with the byte-frozen prompt
 * (R1.3). A `details` image goes to its own one-image call (`readWorkoutDetails`), started at the
 * same instant: the ceiling is 60 s, the soft deadline 55 s and the primary median 28–36 s, so a
 * second call in SERIES would not fit. Its pixels are measured by `lib/extract/chart/*` once both
 * settle — the estimator needs the primary's transcribed distance (A2) and costs milliseconds.
 *
 * Status, by ruling:
 *   primary ok/repaired, details anything   → the primary's status; estimate only if it all worked
 *   primary failed,      details anything   → failed (the primary's code); details kept for audit
 *   no primary (details-only), reading ok   → ok, a session from the printed values + estimate
 *   no primary (details-only), reading fail → failed with the reading's own code
 * Nothing on the details side can turn an otherwise-ok extraction into `failed` (invariant 4).
 */

/** What `extractions.raw_response` holds. A convention on an existing jsonb column, not a migration. */
export interface RawResponseColumn {
  /** The exact JSON body the primary endpoint returned (the repair call's, if one happened). */
  vendor: unknown
  /**
   * The Zod-validated result, stored pre-validated so `GET` is a pure read. The poll endpoint
   * must never re-run extraction logic: re-parsing on every poll could disagree with what was
   * actually written (a different `kindsPresent`, a changed schema after a deploy), and
   * "the numbers changed while I was looking at them" is the one thing D1 cannot tolerate.
   */
  parsedSession: ExtractedSession | null
  attempts: 1 | 2
  /** Present only when a details screenshot was read. */
  details?: {
    /** The details call's raw body. */
    vendor: unknown
    /** Validated printed values, null if the reading failed. */
    printed: DetailsPrinted | null
    /**
     * What the chart estimate wrote into `parsedSession`: `distanceKm` is the estimated distance
     * written into `parsedSession.distanceKm`, else null; `splits` is true when
     * `parsedSession.splits` are chart estimates. null when nothing was estimated.
     */
    estimate: EstimatedValues | null
  }
}

export type JobDeps = ExtractDeps & DetailsDeps

const productionJobDeps: JobDeps = { ...productionDeps, ...productionDetailsDeps }

interface FetchedBlob {
  ref: ExtractionBlobRef
  bytes: Buffer
}

/**
 * Fetch one uploaded screenshot back out of Blob. The bytes are kept (the details image is decoded
 * for its pixels) and re-encoded as a data URI for the vision calls.
 *
 * §2.2: a data URI, not the hosted Blob URL, even though the bytes are already on a public CDN.
 * This matches the measured recipe (`research/lib.mjs`'s `imgPart`) exactly. A `url:`-only
 * `image_url` pointing at the Blob URL was never probed against this endpoint, and per §1's whole
 * lesson, an untested request shape on this vendor is not something to trust in production —
 * especially when the failure mode is "200 OK with invented numbers".
 */
async function fetchBlob(ref: ExtractionBlobRef, signal: AbortSignal): Promise<FetchedBlob> {
  const res = await fetch(ref.url, { signal, cache: 'no-store' })
  if (!res.ok) throw new Error(`blob fetch ${res.status} for ${ref.pathname}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.byteLength === 0) throw new Error(`blob ${ref.pathname} was empty`)
  return { ref, bytes }
}

/**
 * Compression always emits JPEG and the upload route allows only image/jpeg, so the media type is
 * known rather than sniffed.
 */
function dataUriOf(bytes: Buffer): string {
  return `data:${UPLOAD_CONTENT_TYPE};base64,${bytes.toString('base64')}`
}

function isPrimaryScreenKind(kind: ScreenKind): kind is PrimaryScreenKind {
  return (PRIMARY_SCREEN_KINDS as readonly ScreenKind[]).includes(kind)
}

function detailsColumn(
  details: DetailsReading | null,
  estimate: EstimatedValues | null,
): Pick<RawResponseColumn, 'details'> {
  return details === null
    ? {}
    : { details: { vendor: details.vendor, printed: details.printed, estimate } }
}

/** The merge, behind the one try this phase allows itself: a merge failure costs the estimate only. */
function mergeOrDegrade(
  session: ExtractedSession,
  details: DetailsReading | null,
  hasSplitsScreen: boolean,
  extractionId: string,
): { session: ExtractedSession; estimate: EstimatedValues | null } {
  if (details === null) return { session, estimate: null }
  try {
    return mergeWorkoutDetails({
      session,
      printed: details.printed,
      image: details.image,
      hasSplitsScreen,
    })
  } catch (cause) {
    console.error('[f04] workout details merge failed; keeping the other screens', {
      extractionId,
      cause,
    })
    return { session, estimate: null }
  }
}

interface RunExtractionJobInput {
  userId: string
  extractionId: string
  images: ExtractionBlobRef[]
  /** When the route started, so the job's deadline covers the whole invocation, not just itself. */
  invocationStartedAt: number
}

export async function runExtractionJob(
  input: RunExtractionJobInput,
  deps: JobDeps = productionJobDeps,
): Promise<void> {
  const { userId, extractionId, images } = input
  const deadlineAt = input.invocationStartedAt + JOB_DEADLINE_MS

  try {
    // 10 s for three ~60 KB fetches from a CDN in the same region is generous; if Blob is that
    // slow, spending the rest of the budget on a vision call that cannot finish is worse than
    // failing now with a code that says so.
    const blobTimeout = Math.min(10_000, Math.max(1_000, deadlineAt - deps.now()))
    let fetched: FetchedBlob[]
    try {
      fetched = await Promise.all(
        images.map((ref) => fetchBlob(ref, AbortSignal.timeout(blobTimeout))),
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

    // R1.3: the primary request carries the three screens it was measured on, and nothing else.
    const primaryImages: PromptImage[] = []
    let detailsBlob: FetchedBlob | null = null
    for (const blob of fetched) {
      const kind = blob.ref.kind
      if (isPrimaryScreenKind(kind)) primaryImages.push({ kind, dataUri: dataUriOf(blob.bytes) })
      else detailsBlob = blob
    }

    // Derived from OUR upload records. The model's answer never feeds this set — that is the
    // whole point of the provenance guard.
    const kindsPresent: ReadonlySet<PrimaryScreenKind> = new Set(primaryImages.map((i) => i.kind))

    const remaining = deadlineAt - deps.now()
    const [outcome, details] = await Promise.all([
      primaryImages.length > 0
        ? extractSession(deps, primaryImages, kindsPresent, remaining)
        : null,
      detailsBlob === null
        ? null
        : readWorkoutDetails(
            deps,
            { dataUri: dataUriOf(detailsBlob.bytes), bytes: detailsBlob.bytes },
            remaining,
          ),
    ])

    if (outcome === null) {
      if (details === null) throw new Error('an extraction with no images reached the job')
      await finishDetailsOnly(userId, extractionId, details)
      return
    }

    if (outcome.status !== 'failed' && outcome.session !== null) {
      const merged = mergeOrDegrade(
        outcome.session,
        details,
        kindsPresent.has('splits'),
        extractionId,
      )
      const rawResponse: RawResponseColumn = {
        vendor: outcome.rawVendorResponse,
        parsedSession: merged.session,
        attempts: outcome.attempts,
        ...detailsColumn(details, merged.estimate),
      }
      if (outcome.status === 'ok') {
        await markExtractionOk(userId, extractionId, rawResponse, outcome.promptTokens)
      } else {
        await markExtractionRepaired(userId, extractionId, rawResponse, outcome.promptTokens)
      }
      return
    }

    // The canary is worth storing even on the failure path — a `token_floor` row whose
    // prompt_tokens reads 141 is the difference between "the vendor dropped the images" and
    // "the model wrote bad JSON", months after the fact.
    await markExtractionFailed(
      userId,
      extractionId,
      outcome.errorCode ?? 'transport',
      {
        vendor: outcome.rawVendorResponse,
        parsedSession: null,
        attempts: outcome.attempts,
        ...detailsColumn(details, null),
      } satisfies RawResponseColumn,
      outcome.promptTokens,
    )
    console.warn('[f04] extraction failed', {
      extractionId,
      errorCode: outcome.errorCode,
      promptTokens: outcome.promptTokens,
      detailsRead: details?.printed != null,
    })
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

/**
 * A Workout Details screenshot alone. The reading IS the extraction here: there are no other
 * screens whose fields R2.4 must keep intact, so a failed reading is a failed extraction (the same
 * blank review form, plus the reason and a Retry). A reading that worked but whose charts could not
 * be measured is still `ok`, with the printed values filled in.
 */
async function finishDetailsOnly(
  userId: string,
  extractionId: string,
  details: DetailsReading,
): Promise<void> {
  if (details.printed === null) {
    await markExtractionFailed(
      userId,
      extractionId,
      details.errorCode ?? 'validation',
      {
        vendor: null,
        parsedSession: null,
        attempts: 1,
        ...detailsColumn(details, null),
      } satisfies RawResponseColumn,
      details.promptTokens,
    )
    console.warn('[f04] details-only extraction failed', {
      extractionId,
      errorCode: details.errorCode,
    })
    return
  }
  // Every field defaults to null / [] — the empty session no screen has spoken for yet.
  const merged = mergeOrDegrade(RawExtractedSession.parse({}), details, false, extractionId)
  await markExtractionOk(
    userId,
    extractionId,
    {
      vendor: null,
      parsedSession: merged.session,
      attempts: 1,
      ...detailsColumn(details, merged.estimate),
    } satisfies RawResponseColumn,
    details.promptTokens,
  )
}
