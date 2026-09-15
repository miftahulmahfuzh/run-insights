import {
  fillNinaAvatarDescribeTargets,
  NINA_ALBUM_BACKFILL_BUDGET_MS,
  NINA_ALBUM_BACKFILL_SLICE,
} from '@/lib/admin/ninaAlbumDeferredDescribe'
import {
  AdminForbiddenError,
  forbiddenJson,
  requireAdminApi,
} from '@/lib/admin/requireAdmin'
import { UnauthorizedError, unauthorizedJson } from '@/lib/auth/requireUserId'
import {
  countNinaAvatarDescribeBacklog,
  listNinaAvatarDescribeBacklog,
} from '@/lib/nina/queries'

/**
 * `/api/admin/nina/backfill-descriptions` — the one-time sweep that makes the album searchable.
 *
 *     GET   how much work is left; spends nothing
 *     POST  do one slice of it
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────
 * `admin-album-semantic-search` R2 searches `nina_avatars.description`, and the album that exists
 * TODAY was uploaded under a pre-pass that described exactly one row per batch and only when the
 * album had been empty (`lib/admin/ninaAlbumDeferredDescribe.ts`'s header carries the argument that
 * made that right at the time, and the half of it this feature repeals). So the rows already in
 * production split three ways: prose and no vector (promoted, shared, hand-described, or adopted
 * from a chat photo), no prose at all (nearly everything), and both (nothing, before this phase).
 * The first two are this route's backlog. Phase 2's wiring covers every row uploaded from now on;
 * this covers every row that was there first.
 *
 * ── WHY A ROUTE HANDLER AND NOT A SCRIPT, AND NOT AN ACTION ─────────────────────────────────
 * Not a `scripts/*.mjs`: the sweep needs `describeNinaImages` and `embedNinaText`, and both
 * `import 'server-only'` and resolve `@/` aliases, so a plain node process cannot load them. The
 * alternative — a second, script-local spelling of the same two vendor calls — is what
 * `ensureNinaAvatarDescriptionAction`'s docstring refuses in as many words: *"two spellings of one
 * vendor call is how one of them ends up not writing the row."* A one-time sweep over the whole
 * album is the last place to accept the second spelling.
 *
 * Not a Server Action: an action needs an importer, this phase ships no UI, and an exported action
 * nothing calls is a dead export. `app/**\/route.ts` is an entry point by convention (`knip.ts`'s
 * header lists the Next plugin's file conventions among the entries it finds on its own).
 *
 * ── IT IS A SECURITY BOUNDARY IN ITS OWN RIGHT ──────────────────────────────────────────────
 * `proxy.ts` matches neither `/admin` nor `/api/*` (`lib/admin/requireAdmin.ts`'s header), so
 * `requireAdminApi()` below is the ONLY thing between the open internet and a route that spends
 * vendor money per call. It runs FIRST, before any read, exactly as
 * `app/api/admin/nina/upload/route.ts` runs its gate before `handleUpload`. A signed-in non-admin
 * gets the same 404 the pages give; signed out gets a 401, because `fetch()` deserves a status
 * rather than a redirect to HTML.
 *
 * `userId` comes from the session and is never read from the request. There is one user today; the
 * scoping rule (invariant 7) does not care.
 *
 * ── IT IS A SLICE, AND THE OPERATOR LOOPS IT ────────────────────────────────────────────────
 * A describe is ~8-11 s. Three hundred of them do not fit in any function ceiling, so one POST does
 * what fits in `NINA_ALBUM_BACKFILL_BUDGET_MS` and reports `remaining`. It is safe to re-POST
 * immediately and safe to POST twice by accident: the backlog read is `description IS NULL OR
 * description_embedding IS NULL` ordered oldest-first, so a finished row leaves the backlog and a
 * row two workers race is written twice with equal values. Nothing here is a transaction and
 * nothing needs to be.
 *
 *     # how big is it
 *     curl -s -b "$ADMIN_COOKIE" https://<host>/api/admin/nina/backfill-descriptions
 *
 *     # drain it (docs/… the admin-cookie recipe; `scripts/f04-e2e-probe.mjs` is the precedent)
 *     while :; do
 *       out=$(curl -s -X POST -b "$ADMIN_COOKIE" https://<host>/api/admin/nina/backfill-descriptions)
 *       echo "$out"
 *       [ "$(printf '%s' "$out" | node -pe 'JSON.parse(require("fs").readFileSync(0)).remaining')" -gt 0 ] || break
 *     done
 */

/**
 * **300, and it must be a literal**, for the reason `app/admin/nina/page.tsx` now spells: segment
 * config is statically analysed, and the lanes below run on this route's clock — not in `after()`,
 * but directly, because this handler's whole job IS the slow work and there is no response to get
 * out of the way of. `NINA_ALBUM_BACKFILL_BUDGET_MS` (240 s) reserves 60 s under it so a describe
 * that is in flight at the deadline finishes and writes its row.
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

  const backlog = await countNinaAvatarDescribeBacklog(userId)
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
   * Read MORE than the budget can finish (`NINA_ALBUM_BACKFILL_SLICE = 200`), deliberately: the
   * read is one indexed statement over `nina_avatars_user_created_idx` and costs nothing next to a
   * single vision call, and over-reading is what keeps the four lanes busy right up to the deadline
   * instead of idling because the slice ran dry at 20 rows with two minutes left.
   */
  const targets = await listNinaAvatarDescribeBacklog(userId, NINA_ALBUM_BACKFILL_SLICE)
  const outcome = await fillNinaAvatarDescribeTargets(
    userId,
    targets,
    NINA_ALBUM_BACKFILL_BUDGET_MS,
  )

  /*
   * The remaining count is RE-READ, not computed from `targets.length - done`. A count derived from
   * this run's own arithmetic would be wrong the moment an upload's `after()` filled a row in
   * parallel, and "how many are left" is the number the operator's loop condition reads. One extra
   * indexed statement per slice is the right price for a loop that terminates for the right reason.
   */
  const backlog = await countNinaAvatarDescribeBacklog(userId)

  return Response.json({
    ok: true,
    ...outcome,
    ...backlog,
    remaining: backlog.missingDescription + backlog.missingEmbedding,
  })
}
