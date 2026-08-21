import 'server-only'

import { failStalePendingExtractions, getExtraction, listExtractionPhotos } from '@/lib/db/queries'
import type { RawResponseColumn } from '@/lib/llm/runExtractionJob'
import type { ExtractedSession } from '@/lib/schema/extractedSession'
import type { ExtractionResult, ExtractionStatus } from '@/lib/schema/extractionResult'
import { STALE_PENDING_MS, type ScreenKind } from './constants'

/**
 * Read one extraction as F04's published DTO, healing a stranded `pending` row on the way past.
 *
 * Used by both `GET /api/extract/[id]` (the poll) and `/x/[extractionId]` (the first server
 * render), so the page and the poll can never disagree about what a status means.
 */

/** True when a pending row has been pending long enough that nothing is still coming. */
export function isStalePending(
  status: ExtractionStatus,
  createdAt: Date,
  now: number = Date.now(),
): boolean {
  return status === 'pending' && now - createdAt.getTime() > STALE_PENDING_MS
}

/**
 * `after()` guarantees "runs to completion, or the invocation is killed at maxDuration" — it has
 * no notion of resume or retry. If the invocation dies (the 60 s wall, a deploy recycling the
 * compute, an OOM), the callback simply stops and the row stays `pending` forever with no further
 * update coming. No queue, no cron and no worker exists to notice, and a full queue/worker system
 * is not justified for ~17 runs a month.
 *
 * So the self-heal is **lazy and pull-based, inside the read itself**. The client is already
 * polling every few seconds, so this check runs for free on the first poll after 90 s elapses —
 * no cron needed to reach a terminal state. `research/matrix.mjs` proved this vendor's failures
 * are silent; F04's own must not be. A `failed` row with `error_code = 'stale_timeout'` is
 * auditable; a stuck `pending` row is indistinguishable from "still working" without reading
 * timestamps by hand.
 */
export async function readExtractionResult(
  userId: string,
  extractionId: string,
): Promise<ExtractionResult | null> {
  const row = await getExtraction(userId, extractionId)
  if (!row) return null

  let status = row.status as ExtractionStatus
  let errorCode = row.errorCode
  let completedAt = row.completedAt

  if (isStalePending(status, row.createdAt)) {
    const closed = await failStalePendingExtractions(
      userId,
      new Date(Date.now() - STALE_PENDING_MS),
      'stale_timeout',
    )
    if (closed.includes(extractionId)) {
      status = 'failed'
      errorCode = 'stale_timeout'
      completedAt = new Date()
    }
  }

  const photos = await listExtractionPhotos(userId, extractionId)

  // Read back the session the job already validated — never re-parse the vendor text here. A
  // pure read cannot disagree with what was written at completion time, and "the numbers changed
  // while I was looking at them" is the one thing D1 cannot tolerate.
  const raw = row.rawResponse as RawResponseColumn | null
  const session: ExtractedSession | null =
    status === 'ok' || status === 'repaired' ? (raw?.parsedSession ?? null) : null

  return {
    extractionId: row.id,
    status,
    session,
    errorCode,
    kinds: row.blobUrls.map((b) => b.kind as ScreenKind),
    photos: photos.map((p) => ({
      url: p.blobUrl,
      kind: p.kind as ScreenKind,
      width: p.width,
      height: p.height,
    })),
    promptTokens: row.promptTokens,
    createdAt: row.createdAt.toISOString(),
    completedAt: completedAt ? completedAt.toISOString() : null,
  }
}
