import 'server-only'

import {
  getExtraction,
  getRunDetail,
  getRunIdForExtraction,
  listExtractionPhotos,
} from '@/lib/db/queries'
import type {
  ExtractionBlobRefRow,
  ExtractionCorrections,
  ExtractionStatus,
  PhotoKind,
} from '@/lib/db/schema'
import type { RawResponseColumn } from '@/lib/llm/runExtractionJob'
import { draftFromRun, hydrateDraftFromExtraction, type ReviewDraft } from '@/lib/review/draft'

/**
 * **The baseline resolver.** One function per entry point, and one shared shape, because the two
 * screens are the same component tree pointed at different starting data (R-1: `/x/[id]` before a
 * run exists, `/r/[id]/edit` after).
 *
 * The word that matters here is *baseline*. Every correction event records where a value came
 * FROM, and getting that wrong quietly corrupts the one column in the schema whose entire purpose
 * is measurement (`IMPLEMENTATION_PLAN.md` §3). The rule:
 *
 *   - first commit   → baseline is **what the model said**
 *   - later edits    → baseline is **what is currently stored**
 *
 * The baseline is always re-read on the server. The browser sends the edited draft and nothing
 * else; a client that could nominate its own `from` values could rewrite the error profile.
 */

export interface ReviewPhoto {
  url: string
  kind: PhotoKind
  width: number | null
  height: number | null
}

export interface ReviewContext {
  /** 'review' = pre-commit (`/x/[id]`), 'edit' = post-review correction (`/r/[id]/edit`). */
  mode: 'review' | 'edit'
  extractionId: string | null
  /** Null until the first commit. */
  runId: string | null
  /** The values the reviewer starts from — also the diff baseline. */
  baseline: ReviewDraft
  photos: ReviewPhoto[]
  /**
   * `'failed'` puts the screen in §8's manual-entry state: the same layout, every field blank,
   * still keyed to the failed attempt so `runs.extraction_id` stays an honest record that the
   * numbers were typed by a human.
   */
  extractionStatus: ExtractionStatus | null
  errorCode: string | null
  /** The vendor's own JSON, for the read-only disclosure. Never re-parsed, never inferred from. */
  rawVendorResponse: unknown
  existingCorrections: ExtractionCorrections | null
  /**
   * Exactly what was sent to the model, straight off `extractions.blob_urls` — which is also
   * exactly the body `POST /api/extract` accepts. That correspondence is what makes "read these
   * again" a single POST of a value we already hold rather than a re-upload.
   */
  sourceImages: ExtractionBlobRefRow[]
  /** Set when this extraction has already produced a run — the screen redirects rather than re-commit. */
  committedRunId: string | null
}

/** `/x/[extractionId]` — the pre-commit baseline. Returns null when the extraction is not ours. */
export async function loadExtractionReview(
  userId: string,
  extractionId: string,
  now: Date = new Date(),
): Promise<ReviewContext | null> {
  const extraction = await getExtraction(userId, extractionId)
  if (!extraction) return null

  const [photos, committedRunId] = await Promise.all([
    listExtractionPhotos(userId, extractionId),
    getRunIdForExtraction(userId, extractionId),
  ])

  const raw = extraction.rawResponse as RawResponseColumn | null
  const status = extraction.status
  // A `failed` extraction has no session to hydrate from, by contract — §8's blank draft is what
  // `hydrateDraftFromExtraction(null)` returns, so the manual path needs no separate branch.
  const session = status === 'ok' || status === 'repaired' ? (raw?.parsedSession ?? null) : null

  return {
    mode: 'review',
    extractionId,
    runId: null,
    baseline: hydrateDraftFromExtraction(session, now),
    photos: photos.map((p) => ({
      url: p.blobUrl,
      kind: p.kind,
      width: p.width,
      height: p.height,
    })),
    extractionStatus: status,
    errorCode: extraction.errorCode,
    rawVendorResponse: raw?.vendor ?? null,
    existingCorrections: extraction.corrections ?? null,
    sourceImages: extraction.blobUrls ?? [],
    committedRunId,
  }
}

/** `/r/[id]/edit` — the post-review baseline, read from `runs` and its children. */
export async function loadRunEdit(userId: string, runId: string): Promise<ReviewContext | null> {
  const detail = await getRunDetail(userId, runId)
  if (!detail) return null

  const extraction = detail.extractionId ? await getExtraction(userId, detail.extractionId) : null
  const raw = extraction?.rawResponse as RawResponseColumn | null | undefined

  return {
    mode: 'edit',
    extractionId: detail.extractionId,
    runId,
    baseline: draftFromRun(detail, detail.splits, detail.zones),
    photos: detail.photos.map((p) => ({
      url: p.blobUrl,
      kind: p.kind,
      width: p.width,
      height: p.height,
    })),
    extractionStatus: extraction?.status ?? null,
    errorCode: extraction?.errorCode ?? null,
    rawVendorResponse: raw?.vendor ?? null,
    existingCorrections: extraction?.corrections ?? null,
    sourceImages: extraction?.blobUrls ?? [],
    committedRunId: runId,
  }
}
