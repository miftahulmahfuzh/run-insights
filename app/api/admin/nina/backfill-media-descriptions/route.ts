import {
  fillNinaMessageImageDescribeTargets,
  NINA_MEDIA_BACKFILL_BUDGET_MS,
  NINA_MEDIA_BACKFILL_SLICE,
} from '@/lib/admin/ninaMediaDeferredDescribe'
import { AdminForbiddenError, forbiddenJson, requireAdminApi } from '@/lib/admin/requireAdmin'
import { UnauthorizedError, unauthorizedJson } from '@/lib/auth/requireUserId'
import {
  countNinaMessageImageDescribeBacklog,
  listNinaMessageImageDescribeBacklog,
} from '@/lib/nina/queries'

/**
 * `/api/admin/nina/backfill-media-descriptions` — the sweep that makes the MEDIA half searchable.
 *
 *     GET   how much work is left; spends nothing
 *     POST  do one slice of it
 *
 * ── WHY THIS EXISTS BESIDE THE ALBUM'S TWIN ─────────────────────────────────────────────────
 * `media-album-unified-search` R1 widens semantic search from `nina_avatars` to BOTH tables, and
 * `nina_message_images.description_embedding` is new in Phase 1. Every row that existed before that
 * migration has a NULL vector and is therefore invisible to the merged search — which is the whole
 * of R1's "every single picture in any directory", for the pictures that already exist.
 *
 * ── THE TWO HALVES SPLIT DIFFERENTLY HERE THAN THEY DO FOR THE ALBUM ────────────────────────
 * The album's backlog was mostly `missingDescription`: those rows had never been shown to a vision
 * model. This table's is not. `scheduleChatPhotoCaption` (`lib/admin/chatPhotoActions.ts`) has been
 * describing every chat photograph since 2026-09-07, so the prose is already there and only the
 * vector is missing. MEASURED 2026-09-17, before Phase 1's migration: of 112 original rows, 112
 * carry a description and 0 do not. So in practice this route embeds and does not describe, and a
 * full drain costs 112 embedding calls and zero vision calls.
 *
 * That is a fact about today's data, not a guarantee, and the route does NOT encode it: the backlog
 * read is `description IS NULL OR description_embedding IS NULL` exactly as the album's is, so a row
 * whose caption pass failed still earns a describe. Phase 2's own handoff names the standing source
 * of such rows — `setNinaMessageImageDescription` keeps its one caller in `scheduleChatPhotoCaption`
 * HALF ONE, which writes prose with no vector — so this route is a permanent tool, not a one-off.
 *
 * ── A REFERENCE ROW IS NOT BACKLOG, AND THAT IS ENFORCED ONE LAYER DOWN ─────────────────────
 * `listNinaMessageImageDescribeBacklog` and `countNinaMessageImageDescribeBacklog` both carry
 * `isOriginalPhoto()` in their WHERE (Phase 2, `lib/nina/queries/imageEmbeddings.ts`). A reference
 * row re-shows a photograph that lives elsewhere; the merged search ranks the original, never the
 * re-show, so a reference can never carry a vector of its own by design. Counting one as backlog
 * would report permanent, unfixable work forever — 43 rows of it, measured on 2026-09-17. The
 * predicate lives in the query layer rather than here for `isOriginalPhoto`'s own stated reason:
 * every statement that reads this set must read the same set by construction.
 *
 * ── THE SECURITY BOUNDARY, THE SLICE, AND THE LOOP ──────────────────────────────────────────
 * All three are the album route's, verbatim in shape: `proxy.ts` matches neither `/admin` nor
 * `/api/*`, so `requireAdminApi()` below is the only thing between the open internet and a route
 * that spends vendor money per call, and it runs FIRST, before any read. `userId` comes from the
 * session and is never read from the request. One POST does what fits in
 * `NINA_MEDIA_BACKFILL_BUDGET_MS` and reports `remaining`; it is safe to re-POST immediately and
 * safe to POST twice by accident, because the backlog read is oldest-first and the UPDATE is
 * idempotent.
 *
 *     # how big is it
 *     curl -s -b "$ADMIN_COOKIE" https://<host>/api/admin/nina/backfill-media-descriptions
 *
 *     # drain it
 *     while :; do
 *       out=$(curl -s -X POST -b "$ADMIN_COOKIE" https://<host>/api/admin/nina/backfill-media-descriptions)
 *       echo "$out"
 *       [ "$(printf '%s' "$out" | node -pe 'JSON.parse(require("fs").readFileSync(0)).remaining')" -gt 0 ] || break
 *     done
 *
 * For the one-off drain of the rows that exist TODAY — all of which need an embedding and none of
 * which need a describe — `npm run nina:backfill-media-embeddings` is the cheaper path and needs no
 * session at all. See that script's header for why both exist.
 */

/**
 * **300, and it must be a literal**, for `app/admin/nina/page.tsx`'s stated reason: segment config
 * is statically analysed, and the lanes below run on this route's clock — not in `after()`, because
 * this handler's whole job IS the slow work and there is no response to get out of the way of.
 * `NINA_MEDIA_BACKFILL_BUDGET_MS` (240 s) reserves 60 s under it so a describe that is in flight at
 * the deadline finishes and writes its row.
 */
export const maxDuration = 300

/** How much is left, and which half of the work it is. Reads two counts; spends nothing. */
export async function GET(): Promise<Response> {
  let userId: string
  try {
    ;({ userId } = await requireAdminApi())
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return unauthorizedJson()
    if (cause instanceof AdminForbiddenError) return forbiddenJson()
    throw cause
  }

  const backlog = await countNinaMessageImageDescribeBacklog(userId)
  return Response.json({
    ok: true,
    ...backlog,
    remaining: backlog.missingDescription + backlog.missingEmbedding,
  })
}

/** One slice. Returns what it did and what is left. */
export async function POST(): Promise<Response> {
  let userId: string
  try {
    ;({ userId } = await requireAdminApi())
  } catch (cause) {
    if (cause instanceof UnauthorizedError) return unauthorizedJson()
    if (cause instanceof AdminForbiddenError) return forbiddenJson()
    throw cause
  }

  /*
   * Read MORE than the budget can finish (`NINA_MEDIA_BACKFILL_SLICE`), deliberately: the read is
   * one indexed statement over `nina_message_images_user_created_idx` and costs nothing next to a
   * single vendor call, and over-reading is what keeps the lanes busy right up to the deadline
   * instead of idling because the slice ran dry with two minutes left.
   */
  const targets = await listNinaMessageImageDescribeBacklog(userId, NINA_MEDIA_BACKFILL_SLICE)
  const outcome = await fillNinaMessageImageDescribeTargets(
    userId,
    targets,
    NINA_MEDIA_BACKFILL_BUDGET_MS,
  )

  /*
   * The remaining count is RE-READ, not computed from `targets.length - done`. A count derived from
   * this run's own arithmetic would be wrong the moment an add's `after()` filled a row in parallel,
   * and "how many are left" is the number the operator's loop condition reads.
   */
  const backlog = await countNinaMessageImageDescribeBacklog(userId)

  return Response.json({
    ok: true,
    ...outcome,
    ...backlog,
    remaining: backlog.missingDescription + backlog.missingEmbedding,
  })
}
