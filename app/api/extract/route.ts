import { after } from 'next/server'

import { requireUserIdApi, unauthorizedJson, UnauthorizedError } from '@/lib/auth/requireUserId'
import { attachExtractionPhotos, createExtraction } from '@/lib/db/queries'
import type { ExtractionBlobUrls } from '@/lib/db/schema'
import { env } from '@/lib/env'
import { runExtractionJob } from '@/lib/llm/runExtractionJob'
import { findGlobalDuplicatePhoto } from '@/lib/photos/globalDuplicate'
import { notifyDuplicateImagePush } from '@/lib/push/duplicateImage'
import {
  ExtractRequestSchema,
  type ExtractAcceptedResponse,
  type ExtractionBlobRef,
} from '@/lib/schema/extractionResult'

/**
 * `POST /api/extract` — starts a background extraction and returns immediately (D4, R-20).
 *
 * The client waits for one INSERT, not for 33.7 seconds. `after()` runs its callback once the
 * response has been sent but still inside this invocation, extending its lifetime up to
 * `maxDuration`. That is the right primitive here precisely because it needs no new
 * infrastructure — no queue service, no worker, nothing beyond what Vercel already provides —
 * and `@vercel/functions`' `waitUntil()` is the documented fallback with the same semantics if a
 * future Next.js release ever changes `after()`'s guarantees.
 *
 * Why the work cannot simply happen inline: extraction is a 33.7 s median against a 60 s Hobby
 * ceiling, and that median is the happy path — it excludes the repair round-trip, cold start and
 * network variance. `fetch → 33.7 s → Zod → repair → DB write` does not reliably fit in 60 s.
 */

export const runtime = 'nodejs'
/**
 * The Vercel Hobby ceiling, and the budget `after()` shares.
 *
 * A LITERAL `60`, not `FUNCTION_MAX_DURATION_S`. Segment config exports are statically analysed at
 * build time and an imported constant is not a value the analyser can see — `next build` rejects
 * the whole route with "Invalid segment configuration export detected", the same trap `proxy.ts`'s
 * matcher documents. `lib/extract/constants.ts` keeps the shared copy for the job's own budget
 * arithmetic; `tests/extract.pollSchedule.test.ts` asserts the two agree.
 */
export const maxDuration = 60

export async function POST(request: Request): Promise<Response> {
  // The whole invocation's clock starts here, not inside the job: the blob fetches and the vision
  // call share one 60 s envelope with the request that scheduled them, and the job's soft
  // deadline has to be measured against the same origin or it will overshoot.
  const invocationStartedAt = Date.now()

  let userId: string
  try {
    userId = await requireUserIdApi()
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedJson()
    throw error
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ExtractRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request', issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    )
  }
  const { images } = parsed.data

  /*
   * THE AUDIT COLUMN KEEPS EXACTLY THE SHAPE IT HAS ALWAYS HAD, which is why `contentHash` is
   * dropped here rather than passed through. Two reasons, both deliberate:
   *
   *   · `extractions.blob_urls` is the immutable record of what the model was SHOWN. A dedup key
   *     is not part of that record; `run_photos.content_hash` is where it belongs, and the two
   *     tables' deliberate duplication (see the column's own docstring) draws exactly this line.
   *   · `RetryExtraction` re-POSTs those stored rows verbatim. A hash round-tripping through them
   *     would make every retry of a still-attached extraction match its own earlier `run_photos`
   *     rows and buzz the phone for a button the runner pressed on purpose.
   */
  const auditImages: ExtractionBlobUrls = images.map((image) => ({
    url: image.url,
    pathname: image.pathname,
    kind: image.kind,
    width: image.width,
    height: image.height,
    bytes: image.bytes,
  }))

  // Two writes, both scoped to this user:
  //   1. `extractions` — the audit row, opened `pending`, holding what we are about to send.
  //   2. `run_photos` — R-1's attachment point. The photos hang off the EXTRACTION until F05's
  //      commit backfills `run_id`; there is no `runs` row to attach them to and there must not
  //      be one (a placeholder would need a placeholder date and would collide with the R-5
  //      dedupe index on the second upload of any day).
  const { id: extractionId } = await createExtraction(userId, auditImages, env.LLM_VISION_MODEL)
  const { ids: photoIds } = await attachExtractionPhotos(
    userId,
    extractionId,
    images.map((image, index) => ({
      blobUrl: image.url,
      pathname: image.pathname,
      kind: image.kind,
      width: image.width,
      height: image.height,
      bytes: image.bytes,
      contentHash: image.contentHash,
      sortOrder: index,
    })),
  )

  /*
   * R1 — THE DUPLICATE-IMAGE PUSH. Registered BEFORE the job's `after()` so the notification is
   * not queued behind a 33.7 s model call. The job measures its own soft deadline from
   * `invocationStartedAt`, so if the platform runs these in order the job SEES the shortened
   * budget rather than overshooting it — the safe direction, and the reason this ordering is not
   * a gamble.
   *
   * It is not inline for the reason the route exists: the client waits for one INSERT, and a
   * cross-table lookup plus a web-push fan-out is not something a 202 may wait on.
   */
  after(async () => {
    try {
      await notifyDuplicateShots(userId, photoIds, images)
    } catch (cause) {
      /* A notification is a courtesy attached to rows that are already committed. There is
       * nothing to retry against and nobody left to tell. */
      console.warn('[extract] duplicate-image notify failed', { error: String(cause) })
    }
  })

  after(async () => {
    await runExtractionJob({ userId, extractionId, images, invocationStartedAt })
  })

  const body: ExtractAcceptedResponse = { extractionId }
  return Response.json(body, { status: 202 })
}

/**
 * **"Do these bytes already exist anywhere in this runner's collection?"** — asked once per
 * DISTINCT hash in the upload, against all three image tables, excluding everything this upload
 * itself just wrote.
 *
 * ── WHY THE WHOLE BATCH IS EXCLUDED, NOT JUST "THE ROW ITSELF" ────────────────────────────────
 * One `/upload` submits up to three shots. Two of them CAN be the same file (the kinds must
 * differ, the bytes need not), and with only the asking row excluded each would match the other:
 * two pushes for one upload, both pointing at a photograph from the same batch. Excluding every
 * id this request inserted makes the question the honest one — "already", meaning before now.
 *
 * ── EVERY FAILURE IS SILENT ───────────────────────────────────────────────────────────────────
 * A failed lookup or a failed send warns and moves on. The photos are committed; nothing here may
 * ever be load-bearing for them (the invariant every `notifyNinaPush` call site already keeps).
 */
async function notifyDuplicateShots(
  userId: string,
  photoIds: readonly string[],
  images: readonly ExtractionBlobRef[],
): Promise<void> {
  const inserted = images.flatMap((image, index) => {
    const id = photoIds[index]
    return id === undefined || image.contentHash === null
      ? []
      : [{ id, contentHash: image.contentHash }]
  })
  if (inserted.length === 0) return

  const exclude = inserted.map((row) => ({ kind: 'shot' as const, id: row.id }))
  const asked = new Set<string>()
  for (const row of inserted) {
    if (asked.has(row.contentHash)) continue
    asked.add(row.contentHash)
    try {
      const existing = await findGlobalDuplicatePhoto(userId, row.contentHash, { exclude })
      if (existing === null) continue
      await notifyDuplicateImagePush(userId, existing)
    } catch (cause) {
      console.warn('[extract] duplicate-image check failed', { error: String(cause) })
    }
  }
}
