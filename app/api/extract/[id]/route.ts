import { requireUserIdApi, unauthorizedJson, UnauthorizedError } from '@/lib/auth/requireUserId'
import { readExtractionResult } from '@/lib/extract/readExtraction'
import { isValidId } from '@/lib/id'

/**
 * `GET /api/extract/[id]` — the poll (plan §4.4), and the stale-pending self-heal (§4.5).
 *
 * POLL, NOT STREAM. The result is one JSON blob delivered once, not an incremental stream a UI
 * benefits from rendering progressively — there is nothing for the runner to usefully watch
 * update mid-extraction, and R-41 forbids claiming otherwise. SSE from here would have to poll
 * the database internally anyway (the work happens in a *different* invocation's `after()`),
 * which is strictly more moving parts for no user-visible gain. Polling is also trivially
 * resilient to closing the tab and coming back.
 */

export const runtime = 'nodejs'
// Default maxDuration is right: this is two indexed SELECTs, not the extraction itself.

export async function GET(
  _request: Request,
  ctx: RouteContext<'/api/extract/[id]'>,
): Promise<Response> {
  let userId: string
  try {
    userId = await requireUserIdApi()
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedJson()
    throw error
  }

  const { id } = await ctx.params
  // An id that cannot be one of ours should 404 without a query, not with one.
  if (!isValidId(id)) return Response.json({ error: 'Not found' }, { status: 404 })

  // Ownership is baked into the read: `getExtraction` filters on `user_id`, so guessing another
  // user's id returns 404 rather than 403 — the response cannot be used to learn which ids exist.
  const result = await readExtractionResult(userId, id)
  if (!result) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json(result, {
    // A poll response is a point-in-time fact about a row that is about to change. Any cache in
    // front of it — the browser's included — would serve `pending` after the job finished.
    headers: { 'Cache-Control': 'no-store' },
  })
}
