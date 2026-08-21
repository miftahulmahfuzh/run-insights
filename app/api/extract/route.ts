import { after } from 'next/server'

import { requireUserIdApi, unauthorizedJson, UnauthorizedError } from '@/lib/auth/requireUserId'
import { attachExtractionPhotos, createExtraction } from '@/lib/db/queries'
import { env } from '@/lib/env'
import { runExtractionJob } from '@/lib/llm/runExtractionJob'
import { ExtractRequestSchema, type ExtractAcceptedResponse } from '@/lib/schema/extractionResult'

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

  // Two writes, both scoped to this user:
  //   1. `extractions` — the audit row, opened `pending`, holding what we are about to send.
  //   2. `run_photos` — R-1's attachment point. The photos hang off the EXTRACTION until F05's
  //      commit backfills `run_id`; there is no `runs` row to attach them to and there must not
  //      be one (a placeholder would need a placeholder date and would collide with the R-5
  //      dedupe index on the second upload of any day).
  const { id: extractionId } = await createExtraction(userId, images, env.LLM_VISION_MODEL)
  await attachExtractionPhotos(
    userId,
    extractionId,
    images.map((image, index) => ({
      blobUrl: image.url,
      pathname: image.pathname,
      kind: image.kind,
      width: image.width,
      height: image.height,
      bytes: image.bytes,
      sortOrder: index,
    })),
  )

  after(async () => {
    await runExtractionJob({ userId, extractionId, images, invocationStartedAt })
  })

  const body: ExtractAcceptedResponse = { extractionId }
  return Response.json(body, { status: 202 })
}
